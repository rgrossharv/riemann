#!/usr/bin/env python3
"""Install the pinned Lean toolchain, check the submitted proof, and emit a certificate.

Linux and macOS are supported. On Windows, run this script in Ubuntu under WSL.
The standalone download uses only Python's standard library.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
try:
    import resource
except ImportError:
    resource=None
import shutil
import subprocess
import sys
import tarfile
from tempfile import TemporaryDirectory
import time
import urllib.request

from proof_stats import analyze

_MANIFEST_JSON = None
THEOREMS=['riemannHypothesis','riemannZeta_eq_zero_re','LFunction_ne_zero_of_half_lt_re','LFunction_eq_zero_re','LFunction_eq_zero_re_of_isPrimitive']
STANDARD_AXIOMS={'propext','Classical.choice','Quot.sound'}


def sha_file(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()


def download(url,path,expected=None):
    path=Path(path)
    if path.exists() and (expected is None or sha_file(path)==expected):return path
    temporary=path.with_suffix(path.suffix+'.part');path.parent.mkdir(parents=True,exist_ok=True)
    request=urllib.request.Request(url,headers={'User-Agent':'Independent-Lean-Proof-Checker/1.0'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request,timeout=120) as response,temporary.open('wb') as output:shutil.copyfileobj(response,output,1024*1024)
            if expected and sha_file(temporary)!=expected:raise ValueError('SHA-256 mismatch for '+url)
            temporary.replace(path);return path
        except Exception:
            if attempt==2:raise
            time.sleep(2*(attempt+1))


def safe_extract(archive,destination,proof=True):
    destination=Path(destination).resolve()
    config_files={('lean','lean-toolchain'),('lean','lakefile.toml'),('lean','lake-manifest.json')}
    with tarfile.open(archive,'r:gz') as source:
        for member in source:
            parts=PurePosixPath(member.name).parts
            if member.name.startswith('/') or '..' in parts or not (member.isfile() or member.isdir()):raise ValueError('Unsafe archive entry: '+member.name)
            if proof and member.isfile() and parts not in config_files and not (len(parts)>2 and parts[:2]==('lean','src') and parts[-1].endswith('.lean')):raise ValueError('Unexpected proof archive entry: '+member.name)
            target=destination.joinpath(*parts)
            if not target.resolve().is_relative_to(destination):raise ValueError('Archive escapes the working directory')
            if member.isdir():target.mkdir(parents=True,exist_ok=True)
            else:
                target.parent.mkdir(parents=True,exist_ok=True)
                with source.extractfile(member) as data,target.open('xb') as output:shutil.copyfileobj(data,output)
                target.chmod(0o755 if not proof and target.name=='elan-init' else 0o644)


def ensure_system_tools(yes):
    system=platform.system()
    if system=='Darwin' and shutil.which('cc')=='/usr/bin/cc':
        developer_dir=subprocess.run(['xcode-select','--print-path'],capture_output=True,text=True)
        path=developer_dir.stdout.strip()
        if developer_dir.returncode or not path or not Path(path).is_dir():
            raise RuntimeError('Install the Apple command line tools with xcode-select --install, then rerun the checker.')
    missing=[name for name in ('git','cc','make','curl') if not shutil.which(name)]
    if not missing:return
    if system=='Linux' and shutil.which('apt-get'):
        prefix=[] if os.geteuid()==0 else ['sudo'];commands=[prefix+['apt-get','update'],prefix+['apt-get','install','-y','git','curl','build-essential','zstd']]
    elif system=='Linux' and shutil.which('dnf'):
        prefix=[] if os.geteuid()==0 else ['sudo'];commands=[prefix+['dnf','install','-y','git','curl','gcc','gcc-c++','make','zstd']]
    elif system=='Darwin' and shutil.which('brew') and 'cc' not in missing:commands=[['brew','install',*missing]]
    else:raise RuntimeError('Install the required tools ('+', '.join(missing)+'). On macOS run xcode-select --install. On Windows use Ubuntu in WSL.')
    print('Missing system tools:',', '.join(missing))
    for command in commands:print('  '+' '.join(command))
    if not yes and input('Install these missing dependencies? [y/N] ').strip().lower() not in ('y','yes'):raise RuntimeError('System dependency installation declined')
    for command in commands:subprocess.run(command,check=True)


def get_source(args,manifest,work):
    if args.source:
        project=Path(args.source).expanduser().resolve()
        if not (project/'src').is_dir():raise ValueError('--source must point to an extracted Lean project containing src/')
        return project
    project=work/'lean'
    filename='lean-sources.tar.gz'
    cached=work/'downloads'/filename
    if args.archive:
        archive=Path(args.archive).expanduser().resolve()
        if not archive.is_file():raise FileNotFoundError('The archive specified with --archive does not exist or is not a file: '+str(archive))
    else:
        local_archives=(Path.cwd()/filename,Path(__file__).resolve().with_name(filename))
        archive=next((candidate for candidate in local_archives if candidate.is_file()),cached)
    if (project/'src').is_dir():return project
    if not archive.is_file():
        if args.source_url:
            try:download(args.source_url,archive)
            except Exception as error:
                print('Website bundle unavailable; using the original pinned PDF links:',error,flush=True)
        if not archive.exists():
            def part(record):return download(record['url'],work/'downloads'/record['file'],record['sha256'])
            with ThreadPoolExecutor(max_workers=4) as executor:parts=list(executor.map(part,manifest['parts']))
            archive.parent.mkdir(parents=True,exist_ok=True)
            temporary=archive.with_suffix('.assembling')
            with temporary.open('wb') as output:
                for path in parts:
                    with path.open('rb') as stream:shutil.copyfileobj(stream,output)
            temporary.replace(archive)
    print('Extracting the submitted proof source…',flush=True)
    with TemporaryDirectory(prefix='proof-source-',dir=work) as staging:
        safe_extract(archive,staging)
        (Path(staging)/'lean').rename(project)
    return project


def get_elan(work,manifest,env):
    local=work/'.tools/elan';env['ELAN_HOME']=str(local)
    executable=local/'bin/elan'
    if executable.exists():return str(executable)
    existing=shutil.which('elan')
    if existing:return existing
    system=platform.system();arch=platform.machine().lower()
    arch='aarch64' if arch in ('arm64','aarch64') else 'x86_64' if arch in ('x86_64','amd64') else arch
    target=arch+('-apple-darwin' if system=='Darwin' else '-unknown-linux-gnu')
    asset=manifest['elan_assets'].get(target)
    if not asset:raise RuntimeError('Unsupported installer platform: '+target+'. Use Linux, macOS, or Ubuntu in WSL.')
    archive=download(asset['url'],work/'downloads'/('elan-'+target+'.tar.gz'),asset['sha256'])
    with TemporaryDirectory(prefix='elan-installer-',dir=work) as unpack:
        safe_extract(archive,unpack,proof=False)
        subprocess.run([str(Path(unpack)/'elan-init'),'-y','--no-modify-path','--default-toolchain','none'],env=env,check=True)
    return str(executable)


def save_certificate(output,certificate):
    value=dict(certificate)
    value['certificate_sha256']=hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    temporary=output.with_suffix('.tmp');temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temporary.replace(output)


def main():
    if sys.version_info<(3,10):raise SystemExit('Python 3.10 or newer is required.')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir',default='riemann-independent-check')
    source=parser.add_mutually_exclusive_group()
    source.add_argument('--source',help='Use an existing extracted Lean project')
    source.add_argument('--archive',help='Use a downloaded lean-sources.tar.gz (a copy in the current or script directory is found automatically)')
    parser.add_argument('--source-url',default='https://riemann.rylandgross.com/downloads/lean-sources.tar.gz',
                        help='Try this Lean source bundle before using the original checksum-pinned download parts')
    parser.add_argument('--yes',action='store_true',help='Approve installing missing system packages')
    parser.add_argument('--jobs',type=int,default=1,help='Lean worker threads (default: 1)')
    parser.add_argument('--fresh',action='store_true',help='Remove only the project build cache before checking')
    parser.add_argument('--stats-only',action='store_true',help='Analyze sources without installing or running Lean')
    parser.add_argument('--plan',action='store_true',help='Show the steps without installing or checking anything')
    parser.add_argument('--name',default='Independent verifier',help='Optional public attribution in the certificate')
    args=parser.parse_args()
    if args.plan:
        print('1. Obtain and hash-check the exact source and configuration.\n2. Install missing Git/build tools and an isolated pinned Lean toolchain.\n3. Fetch pinned mathlib dependencies and their cache.\n4. Compile Main and every imported proof dependency.\n5. Print the five theorem types and audit their axioms.\n6. Reconfirm source hashes and write a certificate with logs and timings.\nA fresh run installs tools under the selected work directory. Interrupted builds can be resumed.');return 0
    if platform.system()=='Windows':raise SystemExit('Run this checker in Ubuntu under WSL on Windows.')
    if args.jobs<1:parser.error('--jobs must be positive')
    manifest=json.loads(_MANIFEST_JSON) if _MANIFEST_JSON else json.loads(Path(__file__).with_name('proof_manifest.json').read_text())
    work=Path(args.work_dir).expanduser().resolve();work.mkdir(parents=True,exist_ok=True)
    results=work/'results';results.mkdir(exist_ok=True);output=results/'certificate.json'
    certificate={'format':'lean-proof-check/v1','verifier':args.name,'created_at':datetime.now(timezone.utc).isoformat(),'status':'in_progress','source_tree_sha256':manifest['source_tree_sha256'],'toolchain':manifest['toolchain'],'mathlib_revision':manifest['mathlib_revision'],'runner_sha256':sha_file(__file__),'theorems':THEOREMS,'steps':[],'machine':{'system':platform.system(),'architecture':platform.machine(),'logical_cpus':os.cpu_count()},'report_scope':'A reproducible, self-reported local check. The digest detects changes to this report; it is not an identity signature or a substitute for independently rerunning Lean.'}
    began=time.monotonic();save_certificate(output,certificate)
    env=dict(os.environ,LEAN_NUM_THREADS=str(args.jobs))
    def run(label,command,cwd,kind='setup',allow_failure=False):
        print('\n'+label,flush=True);started=time.monotonic();before=resource.getrusage(resource.RUSAGE_CHILDREN)
        name=f'{len(certificate["steps"])+1:02d}-'+re.sub('[^a-z0-9]+','-',label.lower()).strip('-')+'.log';log_path=results/name
        with log_path.open('w') as log:code=subprocess.run(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT).returncode
        after=resource.getrusage(resource.RUSAGE_CHILDREN);cpu=after.ru_utime+after.ru_stime-before.ru_utime-before.ru_stime
        certificate['steps'].append({'label':label,'kind':kind,'exit_code':code,'wall_seconds':round(time.monotonic()-started,3),'cpu_seconds':round(cpu,3),'log':name,'log_sha256':sha_file(log_path)})
        save_certificate(output,certificate)
        if code and not allow_failure:raise RuntimeError(label+' failed; inspect '+str(log_path))
        return log_path
    try:
        project=get_source(args,manifest,work)
        stats=analyze(project);(results/'statistics.json').write_text(json.dumps(stats,indent=2)+'\n')
        certificate['observed_source_tree_sha256']=stats['source_tree_sha256']
        if stats['source_tree_sha256']!=manifest['source_tree_sha256']:raise RuntimeError('The source fingerprint differs from the submitted proof. No certificate of the original source will be issued.')
        for name,expected in manifest['config_sha256'].items():
            if sha_file(project/name)!=expected:raise RuntimeError('Pinned configuration mismatch: '+name)
        certificate['source_statistics']={key:stats[key] for key in ('files','lines','nonblank_lines','bytes','declaration_counts_textual','internal_import_edges')}
        if args.stats_only:certificate['status']='statistics_only';return 0
        ensure_system_tools(args.yes);elan=get_elan(work,manifest,env)
        run('Install pinned Lean',[elan,'toolchain','install',manifest['toolchain']],project)
        lean=[elan,'run',manifest['toolchain']]
        version=run('Record compiler version',lean+['lean','--version'],project)
        certificate['compiler_version']=version.read_text().strip()
        run('Fetch pinned dependency cache',lean+['lake','exe','cache','get'],project,allow_failure=True)
        revision=subprocess.check_output(['git','-C',str(project/'.lake/packages/mathlib'),'rev-parse','HEAD'],text=True).strip()
        if revision!=manifest['mathlib_revision']:raise RuntimeError('The mathlib checkout does not match the pinned commit')
        cache=project/'.lake/build';certificate['incremental_cache_reused']=cache.exists() and not args.fresh
        if args.fresh and cache.exists():shutil.rmtree(cache)
        run('Typecheck Main and all proof imports',lean+['lake','--rehash','--no-cache','build','+Main:olean'],project,'typecheck')
        audit=results/'theorem-certificate.lean'
        audit.write_text('import Main\n'+''.join('#check @'+name+'\n#print axioms '+name+'\n' for name in THEOREMS))
        audit_log=run('Check theorem statements and axioms',lean+['lake','env','lean',str(audit)],project,'typecheck')
        text=audit_log.read_text();matches=re.findall(r'depends on axioms:\s*\[([^\]]*)\]',text,re.S)
        if len(matches)+text.count('does not depend on any axioms')!=len(THEOREMS):raise RuntimeError('The axiom audit did not report all five declarations')
        axioms=sorted({name.strip() for group in matches for name in group.split(',') if name.strip()})
        certificate['axioms']=axioms;certificate['additional_axioms']=sorted(set(axioms)-STANDARD_AXIOMS)
        if any('sorryAx' in name for name in axioms):raise RuntimeError('The checked declarations depend on sorryAx; this is not a completed proof')
        after=analyze(project,progress=False)
        if after['source_tree_sha256']!=stats['source_tree_sha256']:raise RuntimeError('Source files changed during verification')
        certificate['status']='passed_with_additional_axioms' if certificate['additional_axioms'] else 'passed'
        print('\nCheck completed:',certificate['status'],flush=True)
        return 0
    except KeyboardInterrupt:
        certificate['status']='interrupted';certificate['error']='Interrupted; rerun the same command to resume the cached build.';return 130
    except Exception as error:
        certificate['status']='failed';certificate['error']=str(error);print('\n'+str(error),file=sys.stderr);return 1
    finally:
        certificate['finished_at']=datetime.now(timezone.utc).isoformat();certificate['wall_seconds']=round(time.monotonic()-began,3)
        certificate['typecheck_cpu_seconds']=round(sum(step['cpu_seconds'] for step in certificate['steps'] if step['kind']=='typecheck'),3)
        certificate['typecheck_cpu_hours']=certificate['typecheck_cpu_seconds']/3600
        save_certificate(output,certificate);print('Certificate:',output,flush=True)


if __name__=='__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""Build complete Lean/TXT downloads and a one-file independent checker."""
import ast
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tarfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/downloads'


def add_file(archive,name,data):
    info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;info.mtime=0
    import io
    archive.addfile(info,io.BytesIO(data))


def write_tools():
    OUT.mkdir(parents=True,exist_ok=True)
    stats_source=(ROOT/'tools/proof_stats.py').read_text()
    tree=ast.parse(stats_source)
    final_guard=next(node for node in reversed(tree.body) if isinstance(node,ast.If) and '__name__' in ast.get_source_segment(stats_source,node.test))
    embedded='\n'.join(stats_source.splitlines()[:final_guard.lineno-1])
    verifier=(ROOT/'tools/verify_proof.py').read_text().replace('from proof_stats import analyze',embedded)
    verifier=verifier.replace('_MANIFEST_JSON = None','_MANIFEST_JSON = '+repr((ROOT/'tools/proof_manifest.json').read_text()))
    (OUT/'verify_proof.py').write_text(verifier)
    shutil.copyfile(ROOT/'tools/proof_stats.py',OUT/'proof_stats.py')
    shutil.copyfile(ROOT/'tools/proof_manifest.json',OUT/'proof_manifest.json')
    shutil.copyfile(ROOT/'scripts/publish_github.sh',OUT/'publish_github.sh')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools-only',action='store_true',help='Refresh the small tools and metadata using existing archives')
    args=parser.parse_args()
    write_tools()
    lean_out=OUT/'lean-sources.tar.gz';txt_out=OUT/'txt-sources.tar.gz'
    original=ROOT/'lean.tar.gz'
    if args.tools_only:
        if not lean_out.exists() or not txt_out.exists():raise RuntimeError('Build the source archives before using --tools-only')
    elif original.exists():
        shutil.copyfile(original,lean_out)
        with txt_out.open('wb') as raw,gzip.GzipFile(filename='',fileobj=raw,mode='wb',compresslevel=6,mtime=0) as zipped,tarfile.open(fileobj=zipped,mode='w|') as target,tarfile.open(original,'r|gz') as source:
            for member in source:
                parts=PurePosixPath(member.name).parts
                if member.isfile() and parts[:2]==('lean','src') and member.name.endswith('.lean'):
                    path=PurePosixPath(*parts[2:]).with_suffix('.txt');add_file(target,'text/'+str(path),source.extractfile(member).read())
    else:
        with lean_out.open('wb') as a,txt_out.open('wb') as b,gzip.GzipFile(filename='',fileobj=a,mode='wb',compresslevel=6,mtime=0) as ga,gzip.GzipFile(filename='',fileobj=b,mode='wb',compresslevel=6,mtime=0) as gb,tarfile.open(fileobj=ga,mode='w|') as la,tarfile.open(fileobj=gb,mode='w|') as ta:
            for name in ['lake-manifest.json','lakefile.toml','lean-toolchain']:add_file(la,'lean/'+name,(ROOT/'lean'/name).read_bytes())
            for path in sorted((ROOT/'text').rglob('*.txt')):
                relative=path.relative_to(ROOT/'text');data=path.read_bytes()
                add_file(la,'lean/src/'+str(relative.with_suffix('.lean')),data)
                add_file(ta,'text/'+str(relative),data)
    archives={}
    for path in [lean_out,txt_out]:
        digest=hashlib.sha256()
        with path.open('rb') as source:
            for data in iter(lambda:source.read(1024*1024),b''):digest.update(data)
        archives[path.name]={'bytes':path.stat().st_size,'sha256':digest.hexdigest()}
    (OUT/'checksums.json').write_text(json.dumps(archives,indent=2)+'\n')
    (OUT/'SHA256SUMS.txt').write_text(''.join(info['sha256']+'  '+name+'\n' for name,info in archives.items()))
    repo=os.environ.get('GITHUB_REPOSITORY')
    meta={'our_certificate':'To be uploaded','archives':archives}
    if repo:
        meta['repository_url']='https://github.com/'+repo
    cert_dir=ROOT/'certificates';destination=ROOT/'dist/certificates';destination.mkdir(exist_ok=True)
    if (cert_dir/'ours.json').exists():
        certificate=json.loads((cert_dir/'ours.json').read_text())
        expected=json.loads((ROOT/'tools/proof_manifest.json').read_text())
        claimed_digest=certificate.pop('certificate_sha256',None)
        actual_digest=hashlib.sha256(json.dumps(certificate,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
        required={'Typecheck Main and all proof imports','Check theorem statements and axioms'}
        completed={step.get('label') for step in certificate.get('steps',[]) if step.get('exit_code')==0}
        valid=(claimed_digest==actual_digest and certificate.get('status')=='passed'
               and certificate.get('source_tree_sha256')==expected['source_tree_sha256']
               and certificate.get('observed_source_tree_sha256')==expected['source_tree_sha256']
               and certificate.get('toolchain')==expected['toolchain']
               and certificate.get('mathlib_revision')==expected['mathlib_revision']
               and required<=completed and 'axioms' in certificate
               and not set(certificate['axioms'])-{'propext','Classical.choice','Quot.sound'})
        if not valid:raise ValueError('certificates/ours.json is not a complete passing certificate for the pinned proof')
        shutil.copyfile(cert_dir/'ours.json',destination/'ours.json');meta['our_certificate']='Available';meta['certificate_url']='certificates/ours.json'
    elif (destination/'ours.json').exists():
        (destination/'ours.json').unlink()
    (ROOT/'dist/data/site.json').write_text(json.dumps(meta,indent=2)+'\n')
    total=sum(path.stat().st_size for path in (ROOT/'dist').rglob('*') if path.is_file())
    assert total<1_000_000_000, f'Pages site exceeds the 1 GB publishing limit: {total}'
    print(json.dumps({'archives':archives,'total_site_bytes':total,'certificate':meta['our_certificate']},indent=2),flush=True)


if __name__=='__main__':main()

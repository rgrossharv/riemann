#!/usr/bin/env python3
"""Recompute Lean-source statistics with Python's standard library only."""
import argparse
from collections import Counter, deque
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile
import time

DECLARATION = re.compile(rb'^\s*(?:(?:private|protected|noncomputable)\s+)*(theorem|lemma|def|abbrev|structure|class|instance|axiom|opaque)\b', re.M)


def import_header(text):
    """Read the import header, respecting nested Lean comments."""
    result=[]
    depth=0
    for line in text.splitlines():
        visible=[];i=0
        while i<len(line):
            if line.startswith('/-',i):depth+=1;i+=2
            elif depth and line.startswith('-/',i):depth-=1;i+=2
            elif depth:i+=1
            elif line.startswith('--',i):break
            else:visible.append(line[i]);i+=1
        value=''.join(visible).strip()
        if not value:continue
        if value in ('module','prelude'):continue
        match=re.match(r'(?:(?:public|private|meta)\s+)*import\s+(?:all\s+)?(.+)$',value)
        if not match:break
        result.extend(match.group(1).split())
    return result


def source_entries(source):
    source=Path(source)
    if source.is_file():
        with tarfile.open(source,'r|gz') as archive:
            for member in archive:
                parts=PurePosixPath(member.name).parts
                if not member.isfile():continue
                if len(parts)>2 and parts[:2]==('lean','src'):relative=PurePosixPath(*parts[2:])
                elif len(parts)>1 and parts[0]=='text':relative=PurePosixPath(*parts[1:])
                else:continue
                if relative.suffix not in ('.lean','.txt'):continue
                yield str(relative.with_suffix('.lean')),archive.extractfile(member).read()
    else:
        if (source/'src').is_dir():source=source/'src'
        elif (source/'lean/src').is_dir():source=source/'lean/src'
        elif (source/'text').is_dir():source=source/'text'
        for path in sorted(source.rglob('*')):
            if path.suffix not in ('.lean','.txt') or not path.is_file():continue
            if any(part in ('.lake','.git','node_modules','.tools') for part in path.relative_to(source).parts):continue
            yield str(PurePosixPath(*path.relative_to(source).parts).with_suffix('.lean')),path.read_bytes()


def analyze(source, progress=True):
    start=time.monotonic();cpu=time.process_time()
    rows=[];declarations=Counter();groups={}
    lines=nonblank=size=0
    for name,data in source_entries(source):
        split=data.splitlines();count=len(split);filled=sum(bool(line.strip()) for line in split)
        sha=hashlib.sha256(data).hexdigest();group=name.split('/')[0] if '/' in name else 'Entry points'
        category=groups.setdefault(group,{'files':0,'lines':0});category['files']+=1;category['lines']+=count
        declarations.update(word.decode() for word in DECLARATION.findall(data))
        rows.append({'path':name,'lines':count,'bytes':len(data),'sha256':sha,'imports':import_header(data.decode('utf-8'))})
        lines+=count;nonblank+=filled;size+=len(data)
        if progress and len(rows)%25000==0:print(f'Analyzed {len(rows):,} source files',flush=True)
    if not rows:raise ValueError('No Lean source files found in the selected input')
    rows.sort(key=lambda row:PurePosixPath(row['path']).parts)
    digest=hashlib.sha256()
    for row in rows:digest.update(row['path'].encode()+b'\0'+row['sha256'].encode()+b'\n')
    lookup={row['path'][:-5].replace('/','.'):i for i,row in enumerate(rows)}
    graph=[sorted({lookup[module] for module in row['imports'] if module in lookup}) for row in rows]
    depths=[-1]*len(rows);queue=deque()
    if 'Main' in lookup:depths[lookup['Main']]=0;queue.append(lookup['Main'])
    while queue:
        node=queue.popleft()
        for target in graph[node]:
            if depths[target]<0:depths[target]=depths[node]+1;queue.append(target)
    layers={}
    for i,row in enumerate(rows):
        if depths[i]<0:continue
        layer=layers.setdefault(depths[i],{'depth':depths[i],'files':0,'lines':0})
        layer['files']+=1;layer['lines']+=row['lines']
    return {'schema_version':1,'files':len(rows),'lines':lines,'nonblank_lines':nonblank,'blank_lines':lines-nonblank,'bytes':size,
            'source_tree_sha256':digest.hexdigest(),'declaration_counts_textual':dict(declarations),'groups':groups,
            'internal_import_edges':sum(map(len,graph)),'main_import_closure_files':sum(depth>=0 for depth in depths),
            'layers':[layers[key] for key in sorted(layers)],
            'counting_method':'Physical source lines, including comments and blanks; dependencies and generated files excluded. Declaration counts are textual. Import headers respect nested comments. Each layer is the shortest project-import distance from Main, with each file counted once.',
            'analysis_wall_seconds':round(time.monotonic()-start,3),'analysis_cpu_seconds':round(time.process_time()-cpu,3)}


def stats_cli():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',help='Extracted lean/, text/, or a downloaded .tar.gz source archive')
    parser.add_argument('--output',default='proof-statistics.json')
    args=parser.parse_args()
    try:
        value=analyze(Path(args.source).expanduser())
        Path(args.output).expanduser().write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    except (OSError, ValueError, tarfile.TarError) as error:
        parser.exit(1,f'Could not compute statistics: {error}\n')
    print(json.dumps({k:value[k] for k in ('files','lines','nonblank_lines','bytes','source_tree_sha256','declaration_counts_textual','internal_import_edges')},indent=2))
    print('Full report:',args.output)


if __name__=='__main__':
    stats_cli()

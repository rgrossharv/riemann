#!/usr/bin/env python3
"""Losslessly reduce generated static data while preserving every decoded byte."""
from pathlib import Path
import gzip
import hashlib
import json
import sys

root=Path(sys.argv[1]).resolve()
before=after=0
for i,path in enumerate(sorted((root/'dist/data').rglob('*.gz')),1):
    original=path.read_bytes()
    raw=gzip.decompress(original)
    compressed=gzip.compress(raw,compresslevel=9,mtime=0)
    before+=len(original)
    if len(compressed)<len(original):
        assert gzip.decompress(compressed)==raw
        path.write_bytes(compressed)
        after+=len(compressed)
    else:
        after+=len(original)
    if i%150==0:print(f'Compressed {i} assets; saved {before-after:,} bytes',flush=True)
manifest=json.loads((root/'source-data-manifest.json').read_text())
for entry in manifest['assets']:
    data=(root/'dist'/entry['path']).read_bytes()
    entry.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
(root/'source-data-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'before':before,'after':after,'saved_bytes':before-after,'decoded_bytes':'unchanged'},indent=2),flush=True)

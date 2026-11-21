#!/usr/bin/env python3
"""Make a stable static publication while the Tailscale preview stays live."""
from pathlib import Path
import shutil

root=Path(__file__).resolve().parents[1]
shutil.copytree(root/'website',root/'dist',dirs_exist_ok=True)
shutil.copytree(root/'dist',root/'build',dirs_exist_ok=True)
for name in ['metrics','verification']:
    shutil.copyfile(root/f'reports/publication-{name}.json',root/f'build/data/{name}.json')
print('Public static snapshot prepared in build/. Live preview remains in dist/.')

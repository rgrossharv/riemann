#!/usr/bin/env python3
"""Recreate compiler .lean sources from the tracked plain-text copies."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
count = 0
for source in (root / "text").rglob("*.txt"):
    target = root / "lean/src" / source.relative_to(root / "text").with_suffix(".lean")
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or source.read_bytes() != target.read_bytes():
        shutil.copyfile(source, target)
    count += 1
print(f"Restored {count:,} Lean sources.")

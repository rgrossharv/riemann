#!/usr/bin/env python3
"""Package the complete text archive as a static, indexed website."""
from array import array
from collections import defaultdict
from pathlib import Path
import gzip
import hashlib
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def write_gzip(path, value):
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    path.write_bytes(gzip.compress(payload, compresslevel=6, mtime=0))


def main():
    DIST.mkdir(exist_ok=True)
    shutil.copytree(ROOT / "website", DIST, dirs_exist_ok=True)
    (DIST / "data/packs").mkdir(parents=True, exist_ok=True)
    (DIST / "data/index").mkdir(parents=True, exist_ok=True)
    entries = json.loads((ROOT / "reports/files.json").read_text())
    manifest, pack, pack_bytes, pack_id = [], [], 0, 0
    words = {}
    pattern = re.compile(r"\w{2,}", re.UNICODE)
    for i, entry in enumerate(entries):
        data = (ROOT / "text" / entry["path"]).read_bytes().decode('utf-8')
        size = entry["bytes"]
        if pack and (pack_bytes + size > 2_000_000 or len(pack) >= 256):
            write_gzip(DIST / f"data/packs/{pack_id:04d}.json.gz", pack)
            pack, pack_bytes, pack_id = [], 0, pack_id + 1
        manifest.append([entry["path"], entry["lines"], pack_id, len(pack)])
        pack.append(data)
        pack_bytes += size
        # One posting per file; compressed delta lists keep common words small.
        for word in set(pattern.findall(data.lower())):
            postings = words.get(word)
            if postings is None:
                words[word] = array("I", [i])
            else:
                postings.append(i)
        if (i + 1) % 20000 == 0:
            print(f"Indexed {i+1:,} files / {len(words):,} distinct words", flush=True)
    if pack:
        write_gzip(DIST / f"data/packs/{pack_id:04d}.json.gz", pack)
    write_gzip(DIST / "data/manifest.json.gz", manifest)
    shards = defaultdict(dict)
    for word, ids in words.items():
        previous, deltas = 0, []
        for n in ids:
            deltas.append(n - previous)
            previous = n
        shard = hashlib.sha256(word.encode()).hexdigest()[:2]
        shards[shard][word] = deltas
    for shard, terms in shards.items():
        write_gzip(DIST / f"data/index/{shard}.json.gz", terms)
    for name in ("stats.json", "verification.json", "metrics.json", "dependencies.json"):
        path = ROOT / "reports" / name
        if path.exists():
            shutil.copyfile(path, DIST / "data" / name)
    shutil.copyfile(ROOT / "remark.pdf", DIST / "remark.pdf")
    shutil.copyfile(ROOT / "CNAME", DIST / "CNAME")
    (DIST / ".nojekyll").write_text("")
    sizes = [p.stat().st_size for p in DIST.rglob("*") if p.is_file()]
    print(json.dumps({"files": len(entries), "packs": pack_id + 1, "words": len(words), "assets": len(sizes), "bytes": sum(sizes), "largest_asset": max(sizes)}, indent=2), flush=True)


if __name__ == "__main__":
    main()

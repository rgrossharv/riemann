#!/usr/bin/env python3
"""Count original Lean sources and export byte-identical, browsable .txt files."""
from collections import Counter
from pathlib import Path
import hashlib
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "lean/src"
TEXT = ROOT / "text"


def main():
    files = []
    groups = {}
    declarations = Counter()
    total_lines = nonblank = total_bytes = 0
    digest = hashlib.sha256()
    declaration = re.compile(rb"^\s*(?:(?:private|protected|noncomputable)\s+)*(theorem|lemma|def|abbrev|structure|class|instance|axiom|opaque)\b", re.M)
    for i, source in enumerate(sorted(SOURCE.rglob("*.lean")), 1):
        rel = source.relative_to(SOURCE)
        target = TEXT / rel.with_suffix(".txt")
        target.parent.mkdir(parents=True, exist_ok=True)
        data = source.read_bytes()
        if not target.exists():
            shutil.copyfile(source, target)
        lines = len(data.splitlines())
        # Counts of physical lines, including comments; no claim about proof complexity.
        filled = sum(bool(line.strip()) for line in data.splitlines())
        size = len(data)
        sha = hashlib.sha256(data).hexdigest()
        digest.update(str(rel).encode() + b"\0" + sha.encode() + b"\n")
        declarations.update(x.decode() for x in declaration.findall(data))
        entry = {"path": str(rel.with_suffix('.txt')), "lines": lines, "bytes": size}
        files.append(entry)
        group = groups.setdefault(rel.parts[0] if len(rel.parts) > 1 else "Entry points", {"files": 0, "lines": 0})
        group["files"] += 1
        group["lines"] += lines
        total_lines += lines
        nonblank += filled
        total_bytes += size
        if i % 20000 == 0:
            print(f"Exported {i:,} files", flush=True)
    stats = {
        "files": len(files), "lines": total_lines, "nonblank_lines": nonblank,
        "blank_lines": total_lines - nonblank, "bytes": total_bytes,
        "toolchain": (ROOT / "lean/lean-toolchain").read_text().strip(),
        "mathlib_revision": "0df444a360eaa60ab8c11dca51a86af692955474",
        "source_tree_sha256": digest.hexdigest(), "groups": groups,
        "declaration_counts_textual": dict(declarations),
        "counting_method": "Physical lines in all lean/src/**/*.lean files, including comments and blanks; dependencies and generated files excluded. Nonblank means a line containing non-whitespace bytes. Declaration counts are textual, not elaborator results.",
        "largest_files": sorted(files, key=lambda f: f["lines"], reverse=True)[:10],
        "pdf_url": "https://alpo.ge/remark.pdf",
        "theorem_files": ["Statements.txt", "Main.txt", "Supplements/Kernels/MainTheoremsAll.txt"]
    }
    (ROOT / "reports/files.json").write_text(json.dumps(files, ensure_ascii=False, separators=(",", ":")) + "\n")
    (ROOT / "reports/stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in stats.items() if k not in ('groups', 'largest_files')}, indent=2), flush=True)


if __name__ == "__main__":
    main()

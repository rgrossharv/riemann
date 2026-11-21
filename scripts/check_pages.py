#!/usr/bin/env python3
"""Check the static Pages artifact before it can be uploaded."""
from filecmp import cmp
from html.parser import HTMLParser
import gzip
from hashlib import sha256
import json
import re
from urllib.parse import unquote, urlsplit

from site_pages import PAGES, ROOT, published_template


class LinkedFiles(HTMLParser):
    attributes = {"a": "href", "link": "href", "script": "src"}

    def __init__(self):
        super().__init__()
        self.view = None
        self.paths = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "body":
            self.view = attrs.get("data-view")
        url = attrs.get(self.attributes.get(tag))
        if not url:
            return
        parts = urlsplit(url)
        if not parts.scheme and not parts.netloc and parts.path:
            self.paths.add(unquote(parts.path))


def check_pages(output):
    problems = []

    def require(path, source):
        if path.is_dir():
            path = path / "index.html"
        if not path.is_file() or not path.stat().st_size:
            problems.append(f"{source} requires {path.relative_to(output)}")
            return False
        return True

    for name in ("index", *PAGES):
        page = output / f"{name}.html"
        if not require(page, "Site navigation"):
            continue
        links = LinkedFiles()
        links.feed(page.read_text(encoding="utf-8"))
        expected_view = "home" if name == "index" else name
        if links.view != expected_view:
            problems.append(f"{page.name} opens the {links.view!r} view instead of {expected_view!r}")
        for path in sorted(links.paths):
            require(output / path.lstrip("/"), page.name)

    website = ROOT / "website"
    for source in sorted(website.rglob("*")):
        if source.is_file() and source != website / "index.html":
            target = output / source.relative_to(website)
            if require(target, "Website source") and not cmp(source, target, shallow=False):
                problems.append(f"{target.relative_to(output)} differs from website/{source.relative_to(website)}")
    homepage = output / "index.html"
    if homepage.is_file() and homepage.read_text(encoding="utf-8") != published_template():
        problems.append("index.html differs from the current versioned website template")

    for name in ("CNAME", "robots.txt", "sitemap.xml", "data/stats.json",
                 "data/dependencies.json", "data/graph.json.gz", "data/site.json"):
        require(output / name, "Archive")

    manifest = output / "data/manifest.json.gz"
    if require(manifest, "Archive reader"):
        with gzip.open(manifest, "rt", encoding="utf-8") as stream:
            packs = {entry[2] for entry in json.load(stream)}
        for pack in sorted(packs):
            require(output / f"data/packs/{pack:04d}.json.gz", manifest.name)

    search_shard = sha256(b"riemannhypothesis").hexdigest()[:2]
    require(output / f"data/index/{search_shard}.json.gz", "Full-text search for riemannHypothesis")
    editor = output / "assets/lean-editor.js"
    if require(editor, "Lean reader"):
        for asset in sorted(set(re.findall(r"""["']\./([^"'\s]+\.wasm)["']""", editor.read_text(encoding="utf-8")))):
            require(editor.parent / asset, editor.name)

    if problems:
        raise SystemExit("Incomplete Pages artifact:\n" + "\n".join(problems))
    print("Pages artifact ready: entry pages, preview assets, source packs, and downloads are present.")


if __name__ == "__main__":
    check_pages(ROOT / "dist")

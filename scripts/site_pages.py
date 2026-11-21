#!/usr/bin/env python3
"""Generate crawlable entry pages from the archive's shared HTML."""
from html import escape
from hashlib import sha256
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGES = {
    "code": (
        "Riemann Hypothesis Source Code in Lean",
        "Browse the Lean source files for Levent Alpöge’s submitted Riemann Hypothesis argument, including Main.lean and the imported proof modules.",
        ("workspace-sidebar", "reading-pane", "empty-reader", "code-preview"),
    ),
    "statistics": (
        "Riemann Hypothesis Lean Proof Visualizations",
        "Visualize the submitted Lean proof with a source treemap, dependency layers, and an interactive import graph linked to the archive.",
        ("reading-pane", "overview"),
    ),
    "theorem": (
        "Riemann Hypothesis Statement in Lean",
        "Read the exact Riemann Hypothesis theorem in pinned Mathlib and the theorem declaration exported by Levent Alpöge’s submitted Lean argument.",
        ("reading-pane", "theorem-page"),
    ),
    "search": (
        "Search the Lean Proof Archive",
        "Search filenames and source text across the Riemann Hypothesis Lean archive.",
        ("reading-pane", "search-page"),
    ),
    "extras": (
        "Riemann Hypothesis Lean Verification Tools",
        "Download the submitted Lean sources and standalone Python tools for independent proof checking and source statistics.",
        ("reading-pane", "extras-page"),
    ),
}


def write_text(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def published_template():
    website = ROOT / "website"
    revision = sha256()
    for asset in sorted(website.rglob("*")):
        if asset.is_file() and asset.suffix in {".css", ".js", ".ttf", ".wasm"}:
            revision.update(asset.relative_to(website).as_posix().encode("utf-8") + b"\0")
            revision.update(sha256(asset.read_bytes()).digest())
    version = revision.hexdigest()[:12]
    template = (website / "index.html").read_text(encoding="utf-8")
    return re.sub(r'((?:href|src)="(?:style\.css|interface\.css|app\.js|zeta-spiral\.js))"',
                  lambda match: f'{match[1]}?v={version}"', template)


def write_pages(destination):
    template = published_template()
    origin = "https://" + (ROOT / "CNAME").read_text(encoding="utf-8").strip()
    sitemap = [origin + "/"]
    destination.mkdir(parents=True, exist_ok=True)
    write_text(destination / "index.html", template)

    for view, (title, description, visible) in PAGES.items():
        url = f"{origin}/{view}.html"
        robots = '<meta name="robots" content="noindex,follow">' if view == "search" else ""
        metadata = f"""  <title>{escape(title)} | Riemann Archive</title>
  <meta name="description" content="{escape(description)}">
  <link rel="canonical" href="{escape(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Riemann Archive">
  <meta property="og:title" content="{escape(title)}">
  <meta property="og:description" content="{escape(description)}">
  <meta property="og:url" content="{escape(url)}">
  {robots}
"""
        page = re.sub(r"  <!-- Page metadata -->.*?  <!-- End page metadata -->\n", lambda _: metadata, template, flags=re.S)
        page = page.replace('<body data-view="home">', f'<body data-view="{view}">')
        page = page.replace('id="landing" class="landing"', 'id="landing" class="landing" hidden')
        for element in visible:
            page, count = re.subn(r'(<[^>\n]*\bid="' + re.escape(element) + r'"[^>\n]*?) hidden>', r'\1>', page)
            if count != 1:
                raise ValueError(f"Could not show {element} on the {view} page")
        if view == "code":
            source = (ROOT / "text/Main.txt").read_text(encoding="utf-8")
            page = page.replace('<pre id="code-preview" class="exact-statement"></pre>',
                                '<pre id="code-preview" class="exact-statement">' + escape(source) + '</pre>')
        write_text(destination / f"{view}.html", page)
        if view != "search":
            sitemap.append(url)

    urls = "".join(f"  <url><loc>{escape(url)}</loc></url>\n" for url in sitemap)
    write_text(destination / "sitemap.xml",
               '<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "</urlset>\n")
    write_text(destination / "robots.txt", f"User-agent: *\nAllow: /\nSitemap: {origin}/sitemap.xml\n")


if __name__ == "__main__":
    write_pages(ROOT / "dist")

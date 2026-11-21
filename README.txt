Riemann Text Archive - GitHub Pages project
==========================================

A front-facing, read-only website for inspecting Levent Alpöge's submitted
Lean argument, the exact theorem, the complete sources, and independently
reproducible checking instructions.

The website was vibecoded with AI assistance. Its website/checking tools are
open source under the MIT license. Third-party proof/editor authorship and
licenses are retained. The original announcement is https://alpo.ge/remark.pdf.

INDEPENDENT CHECKING
--------------------
Download verify_proof.py from the website's Extras page and run:

  python3 verify_proof.py

Requirements: Python 3.10+, Linux or macOS; use Ubuntu in WSL on Windows.
The standalone script uses Python's standard library. It obtains the exact
source, checks the source/configuration hashes, installs missing build tools
(with approval unless --yes is supplied), uses an isolated elan installation,
installs Lean 4.33.1, fetches the pinned mathlib revision/cache, and compiles
Main with all imported proof dependencies. It then prints the five theorem
types and their axioms, rejects sorryAx, reconfirms source identity, and writes
results/certificate.json with hashed logs and measured CPU/wall time.

The checker looks for lean-sources.tar.gz in your current folder or beside
the script. Use --archive to select a specific download:

  python3 verify_proof.py --archive lean-sources.tar.gz

Repeat the same command to resume a partially completed build. Use --fresh to
remove only that project's generated build cache and check it from scratch.
One Lean worker thread is the default. --jobs can change that setting.
Lean dependencies and the full check need additional disk space and time;
source alone is 1.03 GB uncompressed. The report records cache reuse explicitly.

A certificate is a self-reported, reproducible local verification record. Its
digest detects edits to the report; it is not an identity signature. Additional
axioms are listed explicitly. Someone else can independently rerun the same
inputs and compiler rather than relying on the certificate alone.

Our certificate: To be uploaded.
The statements file has passed the current local Lean check. The full proof
and its dependency build have not yet finished, so no successful certificate
is claimed. Publishing the website does not mark the proof as verified.

RECOMPUTE THE STATISTICS
------------------------
Download proof_stats.py and a Lean or TXT source archive from Extras, then run:

  python3 proof_stats.py lean-sources.tar.gz --output statistics.json

It needs only Python, not Lean. It also accepts txt-sources.tar.gz or an
extracted lean/, lean/src/, or text/ folder. It reports line/blank counts,
source bytes, textual declaration counts, source fingerprint, import edges,
and shortest-distance dependency layers. Nested comments are respected when
reading import headers. It counts shared files once per layer assignment.

SOURCE INVENTORY AND THEOREM
----------------------------
175,187 files; 17,374,215 physical lines; 15,531,759 nonblank lines.
1,030,531,854 source bytes. 778,887 textual theorem declarations and 34,307
lemma declarations. There are 753,261 internal source-import edges and 44
shortest-distance layers. Every source file is reachable from Main.
Dependencies, generated files, and downloaded toolchains are excluded.

Pinned Lean: leanprover/lean4:v4.33.1
Pinned mathlib: 0df444a360eaa60ab8c11dca51a86af692955474
Source tree SHA-256:
27bd2a2fc971307240174cb58dd094f5d433980641079871fd2e8d1c9381f089

The exported theorem is:
  theorem riemannHypothesis : RiemannHypothesis := rhOfAll

The pinned mathlib definition of RiemannHypothesis is:
  ∀ (s : ℂ) (_ : riemannZeta s = 0)
    (_ : ¬∃ n : ℕ, s = -2 * (n + 1)) (_ : s ≠ 1), s.re = 1 / 2

The other exported results concern Dirichlet L-functions. Exact propositions
are in text/Statements.txt; the exports are in text/Main.txt.

PROJECT LAYOUT
--------------
text/                       Complete, byte-identical TXT source tree (tracked)
lean/                       Pinned project configuration and local compiler work
lean/src/                   Original .lean copies; regenerated from text/ in CI
website/                    Static app, official Lean grammar, and editor assets
editor-src/                 Read-only Monaco/TextMate integration
.tools in a check directory  Isolated tools installed by the independent checker
tools/                      Public checker, statistics tool, immutable input pins
scripts/publish_github.sh    One-command GitHub CLI publisher
.github/workflows/pages.yml  Complete source/data/download build and Pages deploy
certificates/               Reviewed verification reports; ours is not uploaded
dist/                       Complete generated static website (not committed)
dist/downloads/             Full .lean and .txt archives and standalone Python tools
reports/                    Statistics, compilation results, and explicit snapshots

Individual files can be browsed with Lean syntax colors, line numbers, find,
folding, and an expandable repository tree. File downloads preserve the
original bytes. Public visitors have no editing/upload/write endpoint.

The dependency layer profile and folder treemap use exact line counts on
linear scales.
Layer = shortest project-import distance from Main, with each file assigned
once. Rectangle areas and bar segment heights are proportional to source lines.

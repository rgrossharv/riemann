#!/usr/bin/env python3
"""Extract the source import graph from the static packs and verify their integrity."""
from collections import Counter, deque
from pathlib import Path
import gzip
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def dependency_layers(manifest, graph):
    main = next(i for i, entry in enumerate(manifest) if entry[0] == 'Main.txt')
    depths = [-1] * len(manifest)
    depths[main] = 0
    queue = deque([main])
    while queue:
        node = queue.popleft()
        for target in graph[node]:
            if depths[target] == -1:
                depths[target] = depths[node] + 1
                queue.append(target)
    layers = {}
    for i, (path, lines, pack, slot) in enumerate(manifest):
        depth = depths[i]
        if depth < 0:
            continue
        layer = layers.setdefault(depth, {'depth': depth, 'files': 0, 'lines': 0, 'groups': {}, 'largest_files': []})
        layer['files'] += 1
        layer['lines'] += lines
        group = path.split('/')[0] if '/' in path else 'Entry points'
        layer['groups'][group] = layer['groups'].get(group, 0) + lines
        layer['largest_files'].append([path, lines])
        layer['largest_files'].sort(key=lambda entry: entry[1], reverse=True)
        del layer['largest_files'][5:]
    ordered = [layers[key] for key in sorted(layers)]
    assert sum(layer['files'] for layer in ordered) == sum(depth >= 0 for depth in depths)
    assert sum(layer['lines'] for layer in ordered) == sum(entry[1] for i, entry in enumerate(manifest) if depths[i] >= 0)
    return depths, ordered


def main():
    manifest = json.loads(gzip.decompress((ROOT / 'dist/data/manifest.json.gz').read_bytes()))
    lookup = {entry[0][:-4].replace('/', '.'): i for i, entry in enumerate(manifest)}
    graph, packs = [], {}
    external, groups = Counter(), Counter()
    digest = hashlib.sha256()
    pattern = re.compile(r'^\s*(?:(?:public|private|meta)\s+)*import\s+([^\n]+)', re.M)
    for i, (path, lines, pack, slot) in enumerate(manifest):
        if pack not in packs:
            packs = {pack: json.loads(gzip.decompress((ROOT / f'dist/data/packs/{pack:04d}.json.gz').read_bytes()))}
        text = packs[pack][slot]
        digest.update(path[:-4].encode() + b'.lean\0' + hashlib.sha256(text.encode()).hexdigest().encode() + b'\n')
        deps = set()
        for match in pattern.finditer(text):
            for module in match.group(1).split('--')[0].split():
                if module in lookup:
                    deps.add(lookup[module])
                else:
                    external[module.split('.')[0]] += 1
        graph.append(sorted(deps))
        origin = path.split('/')[0] if '/' in path else 'Entry points'
        for dep in deps:
            target = manifest[dep][0]
            groups[(origin, target.split('/')[0] if '/' in target else 'Entry points')] += 1
        if (i + 1) % 40000 == 0:
            print(f'Analyzed {i+1:,} files', flush=True)
    stats = json.loads((ROOT / 'reports/stats.json').read_text())
    assert digest.hexdigest() == stats['source_tree_sha256'], 'Static-pack source hash mismatch'
    seen, active, cycles = set(), set(), []
    stack = [(lookup['Main'], False)]
    while stack:
        node, leave = stack.pop()
        if leave:
            active.discard(node)
            continue
        if node in active:
            cycles.append(node)
            continue
        if node in seen:
            continue
        seen.add(node)
        active.add(node)
        stack.append((node, True))
        stack.extend((dep, False) for dep in reversed(graph[node]))
    reverse = [[] for _ in manifest]
    for source, dependencies in enumerate(graph):
        for target in dependencies:
            reverse[target].append(source)
    summary = {
        'nodes': len(manifest), 'internal_import_edges': sum(map(len, graph)),
        'external_import_occurrences': dict(external), 'main_import_closure_files': len(seen),
        'main_import_cycles_detected': len(cycles),
        'group_edges': [[a, b, count] for (a, b), count in sorted(groups.items())],
        'most_imported': [[manifest[i][0], len(reverse[i])] for i in sorted(range(len(manifest)), key=lambda i: len(reverse[i]), reverse=True)[:12]],
        'most_imports': [[manifest[i][0], len(graph[i])] for i in sorted(range(len(manifest)), key=lambda i: len(graph[i]), reverse=True)[:12]],
        'definition': 'Directed edges are explicit project-module imports in the submitted source, not an elaborated proof-term dependency analysis.',
        'source_pack_integrity': f'All {len(manifest)} decoded static text files match the original source tree SHA-256.',
        'source_tree_sha256': digest.hexdigest()
    }
    depths, layers = dependency_layers(manifest, graph)
    summary['layers'] = layers
    summary['layer_definition'] = 'Shortest explicit project-import distance from Main.txt; Main has depth 0. Every reachable file is assigned to exactly one depth, so shared dependencies are counted once.'
    summary['layer_total_lines'] = sum(layer['lines'] for layer in layers)
    summary['layer_total_files'] = sum(layer['files'] for layer in layers)
    for target in [ROOT / 'reports/dependencies.json', ROOT / 'dist/data/dependencies.json']:
        target.write_text(json.dumps(summary, indent=2) + '\n')
    payload = gzip.compress(json.dumps({'imports': graph, 'imported_by': reverse, 'depth_from_main': depths}, separators=(',', ':')).encode(), compresslevel=6, mtime=0)
    (ROOT / 'dist/data/graph.json.gz').write_bytes(payload)
    (ROOT / 'reports/import-graph.json.gz').write_bytes(payload)
    print(json.dumps({key: value for key, value in summary.items() if key not in ('group_edges', 'most_imported', 'most_imports')}, indent=2))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Record aggregate CPU time for a running verification process and its children."""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
TICKS = os.sysconf('SC_CLK_TCK')


def stat(pid):
    value = (Path('/proc') / str(pid) / 'stat').read_text()
    fields = value[value.rfind(')') + 2:].split()
    return {'pid': pid, 'parent': int(fields[1]),
            'cpu': sum(int(fields[i]) for i in (11, 12, 13, 14)) / TICKS,
            'start': int(fields[19]) / TICKS, 'rss': int(fields[21]) * os.sysconf('SC_PAGE_SIZE')}


def main():
    pid = int(sys.argv[1])
    command = (Path('/proc') / str(pid) / 'cmdline').read_bytes()
    assert b'scripts/verify.py' in command, 'Refusing to monitor an unrelated process'
    initial = stat(pid)
    base_cpu=float(sys.argv[2]) if len(sys.argv)>2 else 0
    base_wall=float(sys.argv[3]) if len(sys.argv)>3 else 0
    peak_rss = int(sys.argv[4]) if len(sys.argv)>4 else 0
    last = None
    while True:
        try:
            current = stat(pid)
            if current['start'] != initial['start']:
                break
        except (FileNotFoundError, ProcessLookupError):
            break
        all_processes = {}
        for path in Path('/proc').iterdir():
            if path.name.isdigit():
                try:
                    item = stat(int(path.name))
                    all_processes[item['pid']] = item
                except (FileNotFoundError, ProcessLookupError, PermissionError):
                    pass
        selected = {pid}
        while True:
            more = {key for key, item in all_processes.items() if item['parent'] in selected}
            if more <= selected:
                break
            selected |= more
        items = [all_processes[key] for key in selected if key in all_processes]
        cpu = base_cpu + sum(item['cpu'] for item in items)
        peak_rss = max(peak_rss, sum(item['rss'] for item in items))
        uptime = float(Path('/proc/uptime').read_text().split()[0])
        last = {'status': 'running', 'cpu_seconds': round(cpu, 3), 'cpu_hours': round(cpu / 3600, 6),
                'wall_seconds': round(base_wall + uptime - initial['start'], 2),
                'peak_aggregate_rss_bytes_sampled': peak_rss, 'live_processes': len(items),
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'measurement': 'Sampled aggregate user + system CPU time for the verification driver and its descendants, including reaped children and any recorded resumed attempts. Excludes dependency downloads, website indexing, and the redundant diagnostic statement check. Samples every two seconds; final sample may precede process exit. Summed RSS can count shared mapped pages more than once.',
                'machine': {'logical_cpus': os.cpu_count(), 'system': os.uname().sysname, 'architecture': os.uname().machine}}
        save(last)
        time.sleep(2)
    if last:
        last['status'] = 'finished'
        save(last)


def save(value):
    path = ROOT / 'reports/metrics.json'
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(path)
    target = ROOT / 'dist/data/metrics.json'
    if target.parent.exists():
        target.write_text(path.read_text())


if __name__ == '__main__':
    main()

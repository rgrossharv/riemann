#!/usr/bin/env python3
"""Keep the already-running check supervised after the chat session ends."""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
REPORTS=ROOT/'reports'


def alive(pid):
    try:
        command=(Path('/proc')/str(pid)/'cmdline').read_bytes()
        return b'scripts/verify.py' in command
    except (FileNotFoundError,ProcessLookupError):
        return False


def main():
    pid=int(sys.argv[1])
    assert alive(pid), 'The requested verification process is not running'
    print(f'Supervising verification PID {pid}; cached results are preserved.',flush=True)
    while alive(pid):
        time.sleep(5)
    result=json.loads((REPORTS/'verification.json').read_text())
    if result.get('status') in ('passed','failed'):
        print('Verification ended: '+result['status'],flush=True)
        return
    # The session ended without a final result. Resume its cached Main build.
    time.sleep(3)
    previous=json.loads((REPORTS/'metrics.json').read_text())
    ledger=REPORTS/'previous-check-attempts.json'
    attempts=json.loads(ledger.read_text()) if ledger.exists() else []
    attempts.append({'reason':'Verification process interrupted; resumed by the overnight service','recorded_at':datetime.now(timezone.utc).isoformat(),**previous})
    ledger.write_text(json.dumps(attempts,indent=2)+'\n')
    log_path=REPORTS/'main-build.log'
    if log_path.exists():
        log_path.rename(REPORTS/('main-build-before-resume-'+str(int(time.time()))+'.log'))
    with (REPORTS/'overnight-resume.log').open('w') as log:
        process=subprocess.Popen([sys.executable,str(ROOT/'scripts/verify.py'),'--resume-main'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        monitor=subprocess.Popen([sys.executable,str(ROOT/'scripts/monitor_verification.py'),str(process.pid),str(previous.get('cpu_seconds',0)),str(previous.get('wall_seconds',0)),str(previous.get('peak_aggregate_rss_bytes_sampled',0))],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        print(f'Resumed under this user service as PID {process.pid}.',flush=True)
        code=process.wait()
        monitor.wait(timeout=10)
        print(f'Resumed verification exited with code {code}.',flush=True)


if __name__=='__main__':
    main()

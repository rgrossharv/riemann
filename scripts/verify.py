#!/usr/bin/env python3
"""Reproduce compilation without editing the downloaded project."""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import resource
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
ENV = dict(os.environ, LEAN_NUM_THREADS="1", PATH=str(Path.home() / '.elan/bin') + os.pathsep + os.environ.get('PATH', '/usr/bin:/bin'))
history = []


def report(status, title, detail):
    value = {"status": status, "title": title, "detail": detail,
             "checked_at": datetime.now(timezone.utc).isoformat(), "steps": history,
             "toolchain": "leanprover/lean4:v4.33.1"}
    path = REPORTS / "verification.json"
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)
    if (ROOT / 'dist/data').exists():
        (ROOT / 'dist/data/verification.json').write_text(path.read_text())


def run(label, command, log_name):
    print(label, flush=True)
    report("running", "Local compilation in progress", label + ". A successful typecheck of the claimed theorems has not yet been established.")
    started = time.monotonic()
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    with (REPORTS / log_name).open('w') as log:
        result = subprocess.run(command, cwd=ROOT / 'lean', env=ENV, stdout=log, stderr=subprocess.STDOUT)
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu = after.ru_utime + after.ru_stime - before.ru_utime - before.ru_stime
    history.append({"label": label, "command": command, "exit_code": result.returncode, "log": 'reports/' + log_name,
                    "cpu_seconds": cpu, "cpu_hours": cpu / 3600, "wall_seconds": time.monotonic() - started})
    print(f"{label}: exit {result.returncode}", flush=True)
    if result.returncode:
        tail = (REPORTS / log_name).read_text(errors='replace')[-6000:]
        report("failed", "Local compilation failed", f"{label} exited with code {result.returncode}.\n\n{tail}")
        return False
    return True


def main():
    if '--resume-main' in sys.argv:
        previous=json.loads((REPORTS / 'verification.json').read_text())
        history.extend(step for step in previous.get('steps', []) if step.get('exit_code') == 0)
        if not any(step['label'] == 'Checking the stated propositions' for step in history):
            raise RuntimeError('Resume requested without a successful statements check')
    else:
        if not run("Checking the stated propositions", ["lake", "env", "lean", "src/Statements.lean"], "statements-check.log"):
            return 1
    if not run("Compiling Main and its imported proof dependencies", ["lake", "--no-cache", "build", "+Main:olean"], "main-build.log"):
        return 1
    audit = REPORTS / 'AxiomAudit.lean'
    audit.write_text('import Main\n' + '\n'.join('#print axioms ' + name for name in ['riemannHypothesis', 'riemannZeta_eq_zero_re', 'LFunction_ne_zero_of_half_lt_re', 'LFunction_eq_zero_re', 'LFunction_eq_zero_re_of_isPrimitive']) + '\n')
    if not run("Inspecting axioms of the five main declarations", ["lake", "env", "lean", str(audit)], "axiom-check.log"):
        return 1
    if not run("Compiling every configured default target", ["lake", "--no-cache", "build"], "full-build.log"):
        return 1
    report("passed", "All configured sources typecheck", "Main, its proof dependencies, and every configured default build target compiled successfully. Consult the axiom audit for the assumptions of the five main declarations.")
    return 0


if __name__ == '__main__':
    sys.exit(main())

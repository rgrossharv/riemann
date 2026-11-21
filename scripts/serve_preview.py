#!/usr/bin/env python3
"""Serve only the static output, copying website edits into it as they change."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import threading
import time

ROOT = Path(__file__).resolve().parents[1]


class StaticHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


def synchronize():
    times = {}
    while True:
        for source in (ROOT / 'website').rglob('*'):
            if not source.is_file():
                continue
            relative = source.relative_to(ROOT / 'website')
            stamp = source.stat().st_mtime_ns
            if times.get(str(relative)) != stamp:
                target = ROOT / 'dist' / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_suffix(target.suffix + '.tmp')
                shutil.copyfile(source, temporary)
                temporary.replace(target)
                times[str(relative)] = stamp
        time.sleep(1)


if __name__ == '__main__':
    threading.Thread(target=synchronize, daemon=True).start()
    handler = partial(StaticHandler, directory=str(ROOT / 'dist'))
    server = ThreadingHTTPServer(('127.0.0.1', 8765), handler)
    print('Static archive preview: http://127.0.0.1:8765/', flush=True)
    server.serve_forever()

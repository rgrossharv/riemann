#!/usr/bin/env python3
"""Exercise the actual static reader and search using Firefox's Marionette API."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import base64
import json
import socket
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class Marionette:
    def __init__(self, port):
        self.socket = socket.create_connection(('127.0.0.1', port), timeout=20)
        self.socket.settimeout(40)
        self.identifier = 0
        self.read()

    def read(self):
        length = b''
        while not length.endswith(b':'):
            char = self.socket.recv(1)
            if not char:
                raise RuntimeError('Firefox closed the connection')
            length += char
        size = int(length[:-1])
        payload = b''
        while len(payload) < size:
            payload += self.socket.recv(size - len(payload))
        return json.loads(payload)

    def command(self, name, args=None):
        self.identifier += 1
        payload = json.dumps([0, self.identifier, name, args or {}]).encode()
        self.socket.sendall(str(len(payload)).encode() + b':' + payload)
        value = self.read()
        if value[2] is not None:
            raise RuntimeError(value[2])
        return value[3]

    def js(self, script):
        return self.command('WebDriver:ExecuteScript', {'script': script, 'args': [], 'newSandbox': False, 'sandbox': 'default'})['value']

    def click(self, selector):
        point = self.js('const node=document.querySelector('+json.dumps(selector)+');(node.closest("svg")||node).scrollIntoView({block:"center"});const box=node.getBoundingClientRect();return {x:Math.round(box.left+box.width/2),y:Math.round(box.top+box.height/2)}')
        self.command('WebDriver:PerformActions', {'actions':[{'type':'pointer','id':'mouse','parameters':{'pointerType':'mouse'},'actions':[{'type':'pointerMove','origin':'viewport','duration':0,**point},{'type':'pointerDown','button':0},{'type':'pointerUp','button':0}]}]})

    def until(self, script, timeout=40):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            result = self.js('return ' + script)
            if result:
                return result
            time.sleep(.2)
        detail = self.js('return JSON.stringify({ui:document.getElementById("error")?.textContent,phase:window.wrappedJSObject.__leanReaderPhase,errors:window.__qaErrors||[],resources:performance.getEntriesByType("resource").filter(item=>/editor|onig/.test(item.name)).map(item=>({name:item.name,duration:item.duration,bytes:item.transferSize}))})')
        raise AssertionError('Timed out: ' + script + '\nBrowser detail: ' + detail)


def main():
    assert (ROOT / 'dist/data/manifest.json.gz').exists(), 'Build the static site first'
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'dist')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    # Snap Firefox cannot see the host's /tmp; a profile under the project is visible.
    with tempfile.TemporaryDirectory(prefix='riemann-firefox-', dir=ROOT / 'reports') as profile:
        port = 2839
        (Path(profile) / 'user.js').write_text('user_pref("marionette.port", 2839);\nuser_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("browser.startup.homepage_override.mstone", "ignore");\n')
        log = (ROOT / 'reports/browser-firefox.log').open('w')
        firefox = subprocess.Popen(['firefox', '--headless', '--no-remote', '--marionette', '--profile', profile, 'about:blank'], stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 40
            client = None
            while time.monotonic() < deadline:
                try:
                    client = Marionette(port)
                    break
                except (ConnectionRefusedError, OSError):
                    if firefox.poll() is not None:
                        raise RuntimeError('Firefox exited: ' + (ROOT / 'reports/browser-firefox.log').read_text()[-1500:])
                    time.sleep(.2)
            assert client is not None, 'Firefox did not open its automation port'
            client.command('WebDriver:NewSession', {'capabilities': {'alwaysMatch': {'acceptInsecureCerts': False}}})
            client.command('WebDriver:SetWindowRect', {'width': 1440, 'height': 1080})
            url = f'http://127.0.0.1:{server.server_port}/'
            client.command('WebDriver:Navigate', {'url': url})
            client.until('document.getElementById("result-count").textContent.includes("175,187")')
            client.js('window.__qaErrors=[];window.addEventListener("error",event=>window.__qaErrors.push(event.message));window.addEventListener("unhandledrejection",event=>window.__qaErrors.push(String(event.reason)));return true')
            assert client.js('return document.getElementById("stat-lines").textContent') == '17,374,215'
            assert client.js('return document.querySelector(".exact-statement").textContent.includes("theorem riemannHypothesis : RiemannHypothesis := rhOfAll")')
            assert client.js('return document.getElementById("our-certificate-status").textContent') == 'To be uploaded'
            assert client.js('return document.querySelector(".open-source-note").textContent.includes("vibecoded with AI assistance")')
            assert client.js('return document.querySelector(".open-source-note").textContent.includes("open source")')
            assert client.js('return Array.from(document.querySelectorAll(".layer-row")).reduce((sum,row)=>sum+Number(row.dataset.lines),0)') == 17374215
            assert client.js('return Array.from(document.querySelectorAll(".layer-bar")).every(bar=>Array.from(bar.children).reduce((sum,part)=>sum+Number(part.dataset.lines),0)===Number(bar.dataset.lines))')
            assert client.js('const bars=Array.from(document.querySelectorAll(".layer-bar")); const largest=Math.max(...bars.map(bar=>Number(bar.dataset.lines))); return bars.every(bar=>Math.abs(parseFloat(bar.style.width)/100-Number(bar.dataset.lines)/largest)<1e-6)')
            assert client.js('const nodes=Array.from(document.querySelectorAll(".group-node circle[data-lines]")); const ratios=nodes.map(node=>Number(node.getAttribute("r"))**2/Number(node.dataset.lines));return Math.max(...ratios)-Math.min(...ratios)<1e-10')
            assert client.js('const shapes=Array.from(document.querySelectorAll(".treemap-data"));return shapes.reduce((sum,node)=>sum+Number(node.dataset.lines),0)') == 17374215
            assert client.js('const shapes=Array.from(document.querySelectorAll(".treemap-data"));const ratios=shapes.map(node=>Number(node.getAttribute("width"))*Number(node.getAttribute("height"))/Number(node.dataset.lines));return Math.max(...ratios)-Math.min(...ratios)<1e-10')
            assert client.js('const shapes=Array.from(document.querySelectorAll(".profile-data"));const ratios=shapes.map(node=>Number(node.getAttribute("height"))/Number(node.dataset.lines));return Math.max(...ratios)-Math.min(...ratios)<1e-10')
            client.click('.treemap-data[data-path="Development"]')
            assert client.js('return document.getElementById("treemap-location").textContent') == 'text/Development/'
            assert client.js('return Array.from(document.querySelectorAll(".treemap-data")).reduce((sum,node)=>sum+Number(node.dataset.lines),0)') == 12232663
            client.click('#treemap-reset')
            assert client.js('return document.querySelectorAll(".proof-stage").length') == 10
            client.click('[data-stage="reflection"]')
            assert 'rh_of_every' in client.js('return document.getElementById("proof-detail-theorem").textContent')
            screenshot = client.command('WebDriver:TakeScreenshot', {'id': None, 'full': False})['value']
            (ROOT / 'reports/browser-proof.png').write_bytes(base64.b64decode(screenshot))
            client.js('document.getElementById("source-treemap").scrollIntoView({block:"start"}); return true')
            screenshot = client.command('WebDriver:TakeScreenshot', {'id': None, 'full': False})['value']
            (ROOT / 'reports/browser-treemap.png').write_bytes(base64.b64decode(screenshot))
            client.js('document.querySelector("[data-open=\\"Main.txt\\"]").click(); return true')
            client.until('document.getElementById("plain-text").value.includes("theorem riemannHypothesis")')
            assert client.js('return document.getElementById("plain-text").readOnly')
            client.until('window.wrappedJSObject.riemannReader && window.wrappedJSObject.riemannReader.getValue().includes("theorem riemannHypothesis")', timeout=60)
            assert client.js('return window.wrappedJSObject.riemannReader.isReadOnly()')
            assert client.js('return document.getElementById("download-text").download') == 'Main.txt'
            assert client.js('return document.getElementById("download-lean").download') == 'Main.lean'
            client.until('new Set(Array.from(document.querySelectorAll(".monaco-editor .view-line span")).map(node=>getComputedStyle(node).color)).size >= 3')
            value=client.js('return window.wrappedJSObject.riemannReader.getValue()')
            client.js('document.querySelector(".monaco-editor textarea").focus(); return true')
            client.command('WebDriver:PerformActions', {'actions':[{'type':'key','id':'keyboard','actions':[{'type':'keyDown','value':'X'},{'type':'keyUp','value':'X'}]}]})
            assert client.js('return window.wrappedJSObject.riemannReader.getValue()') == value, 'Typing changed the read-only source'
            client.js('const input=document.getElementById("find-input"); input.value="theorem "; input.dispatchEvent(new Event("input")); return true')
            assert client.js('return document.getElementById("find-count").textContent') == '1 / 5'
            client.js('document.getElementById("find-next").click(); return true')
            assert client.js('return document.getElementById("find-count").textContent') == '2 / 5'
            client.js('document.getElementById("line-input").value=9; document.getElementById("go-line").click(); return true')
            assert client.js('return document.getElementById("document-position").textContent') == 'Line 9'
            client.js('document.getElementById("repository-button").click(); return true')
            client.until('!document.getElementById("explorer-panel").hidden')
            client.js('document.querySelector(".tree-item[data-path=\\"Statements.txt\\"]").click(); return true')
            client.until('window.wrappedJSObject.riemannReader.getValue().includes("def RiemannZetaZerosOnLine")')
            assert client.js('return document.querySelectorAll(".file-tab").length') == 2
            client.js('Array.from(document.querySelectorAll(".file-tab [role=tab]")).find(button=>button.textContent==="Main.txt").click(); return true')
            client.until('window.wrappedJSObject.riemannReader.getValue().includes("theorem riemannHypothesis")')
            largest=json.loads((ROOT / 'reports/stats.json').read_text())['largest_files'][0]
            client.js('location.hash = new URLSearchParams({file:'+json.dumps(largest['path'])+',line:'+str(largest['lines'])+'}).toString(); return true')
            client.until('document.getElementById("file-name").textContent==='+json.dumps(largest['path'].split('/')[-1])+' && window.wrappedJSObject.riemannReader.getPosition()?.lineNumber === '+str(largest['lines']),timeout=60)
            assert client.js('return window.wrappedJSObject.riemannReader.isReadOnly()')
            client.js('Array.from(document.querySelectorAll(".file-tab [role=tab]")).find(button=>button.textContent==="Main.txt").click(); return true')
            client.until('window.wrappedJSObject.riemannReader.getValue().includes("theorem riemannHypothesis")')
            screenshot = client.command('WebDriver:TakeScreenshot', {'id': None, 'full': False})['value']
            (ROOT / 'reports/browser-repository.png').write_bytes(base64.b64decode(screenshot))
            client.js('document.getElementById("search-button").click(); return true')
            client.js('const r=document.querySelector("input[value=text]"); r.checked=true; r.dispatchEvent(new Event("change")); document.getElementById("search-input").value="riemannHypothesis"; document.getElementById("search-form").requestSubmit(); return true')
            client.until('document.getElementById("cancel-search").hidden && document.getElementById("results").children.length > 0', timeout=60)
            assert client.js('return document.getElementById("results").textContent.includes("Main.txt")')
            client.js('document.getElementById("file-dependencies").click(); return true')
            client.until('document.getElementById("dependency-counts").textContent.includes("2 direct project imports")')
            assert client.js('return document.getElementById("imports-list").textContent.includes("Statements.txt")')
            print('PASS: desktop loading, statistics, exact layer-line totals, proportional bar widths and group-circle areas, interactive proof map, colored Lean editor, native typing blocked, repository tree, file tabs, find/next, line navigation, indexed full-text search, module dependency web', flush=True)
            client.js('document.getElementById("overview-button").click(); return true')
            screenshot = client.command('WebDriver:TakeScreenshot', {'id': None, 'full': False})['value']
            (ROOT / 'reports/browser-desktop.png').write_bytes(base64.b64decode(screenshot))
            client.js('document.getElementById("layers-title").scrollIntoView({block:"start"}); return true')
            screenshot = client.command('WebDriver:TakeScreenshot', {'id': None, 'full': False})['value']
            (ROOT / 'reports/browser-layers.png').write_bytes(base64.b64decode(screenshot))
            client.command('WebDriver:SetWindowRect', {'width': 390, 'height': 844})
            time.sleep(.3)
            assert client.js('return document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Mobile page overflows horizontally'
            screenshot = client.command('WebDriver:TakeScreenshot', {'id': None, 'full': False})['value']
            (ROOT / 'reports/browser-mobile.png').write_bytes(base64.b64decode(screenshot))
            print('PASS: mobile layout has no horizontal overflow', flush=True)
            print(json.dumps({'url': url, 'browser': 'Firefox', 'result': 'passed'}), flush=True)
            client.command('WebDriver:DeleteSession')
            client.socket.close()
        finally:
            firefox.terminate()
            try:
                firefox.wait(timeout=10)
            except subprocess.TimeoutExpired:
                firefox.kill()
            log.close()
            server.shutdown()


if __name__ == '__main__':
    main()

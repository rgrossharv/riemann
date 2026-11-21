import {initializeProofGuide, renderGroupWeb, renderDependencyLayers, createDependencyExplorer} from './proof-guide.js';
import {createRepositoryExplorer} from './repository.js';
import {createSourceTreemap} from './source-visuals.js';
const $ = id => document.getElementById(id);
const number = n => Number(n).toLocaleString('en-US');
let manifest = [], lookup = new Map(), filtered = [], visible = 120;
let currentPath = '', currentText = '', downloadURL = '', loadId = 0;
let matchOffsets = [], selectedMatch = -1, searchId = 0;
const packs = new Map();
const worker = new Worker('search-worker.js');
const reader = $('plain-text');
let inputTimer;
let dependencyExplorer, proofGuide;
let repository, leanView, leanViewPromise;
const openTabs=[];
window.MonacoEnvironment={getWorker:()=>new Worker(new URL('./assets/editor-worker.js',import.meta.url),{type:'module'})};
const storedTheme = localStorage.getItem('riemann-theme');
if (storedTheme === 'light') document.body.classList.add('light');
$('theme-button').onclick = () => {
  document.body.classList.toggle('light');
  localStorage.setItem('riemann-theme', document.body.classList.contains('light') ? 'light' : 'dark');
};
function error(message) { $('error').textContent = message; $('error').hidden = false; }
async function unpack(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const blob = new Blob([bytes]);
  const stream = bytes[0] === 31 && bytes[1] === 139 ? blob.stream().pipeThrough(new DecompressionStream('gzip')) : blob.stream();
  return JSON.parse(await new Response(stream).text());
}
function navigate(path, line = null, find = '') {
  const params = new URLSearchParams({file: path});
  if(line!==null)params.set('line',String(line));
  if (find) params.set('find', find);
  const hash = '#' + params;
  if (location.hash === hash) route(); else location.hash = hash;
}
function renderFiles() {
  const fragment = document.createDocumentFragment();
  for (const id of filtered.slice(0, visible)) {
    const entry = manifest[id];
    const button = document.createElement('button');
    button.className = 'result' + (entry[0] === currentPath ? ' active' : '');
    button.setAttribute('role', 'listitem');
    const title = document.createElement('strong');
    title.textContent = entry[0].split('/').at(-1);
    const sub = document.createElement('small');
    sub.textContent = entry[0].includes('/') ? entry[0].slice(0, entry[0].lastIndexOf('/')) : 'Entry point';
    const detail = document.createElement('small');
    detail.textContent = `${number(entry[1])} lines`;
    button.append(title, sub, detail);
    button.onclick = () => navigate(entry[0]);
    fragment.append(button);
  }
  $('results').replaceChildren(fragment);
  $('result-count').textContent = `${number(filtered.length)} files${filtered.length > visible ? ` · showing ${number(visible)}` : ''}`;
  $('more-results').hidden = filtered.length <= visible;
}
function mode() { return document.querySelector('input[name=mode]:checked').value; }
function searchFiles() {
  const query = $('search-input').value.trim().toLowerCase().replace(/\.lean$/, '.txt');
  filtered = [];
  for (let id = 0; id < manifest.length; id++) if (manifest[id][0].toLowerCase().includes(query)) filtered.push(id);
  // Keep the main statements easy to find in the initial list.
  if (!query) filtered.sort((a, b) => (manifest[a][0] === 'Main.txt' ? -1 : manifest[b][0] === 'Main.txt' ? 1 : manifest[a][0] === 'Statements.txt' ? -1 : manifest[b][0] === 'Statements.txt' ? 1 : 0));
  visible = 120;
  renderFiles();
}
function stopSearch() {
  worker.postMessage({type: 'cancel'});
  searchId++;
  $('cancel-search').hidden = true;
}
$('cancel-search').onclick = () => { stopSearch(); $('result-count').textContent += ' · stopped'; };
$('search-input').addEventListener('input', () => {
  clearTimeout(inputTimer);
  if (mode() === 'files') inputTimer = setTimeout(searchFiles, 120);
});
document.querySelectorAll('input[name=mode]').forEach(radio => radio.onchange = () => {
  stopSearch();
  if (mode() === 'files') searchFiles();
  else { $('results').replaceChildren(); $('result-count').textContent = 'Enter words or a phrase, then press Find.'; $('more-results').hidden = true; }
});
$('search-form').onsubmit = event => {
  event.preventDefault();
  if (mode() === 'files') return searchFiles();
  const query = $('search-input').value.trim();
  if (!query) return;
  $('results').replaceChildren();
  $('more-results').hidden = true;
  $('cancel-search').hidden = false;
  $('result-count').textContent = 'Searching…';
  worker.postMessage({type: 'search', id: ++searchId, query});
};
worker.onmessage = event => {
  const data = event.data;
  if (data.id !== searchId) return;
  if (data.type === 'error') { $('cancel-search').hidden = true; error(data.message); $('result-count').textContent = 'Search failed. Please retry.'; return; }
  $('result-count').textContent = `${data.items?.length || 0}${data.truncated ? '+' : ''} matches · ${number(data.scanned)} / ${number(data.total)} files${data.done ? '' : ' searched'}`;
  if (data.items) {
    const fragment = document.createDocumentFragment();
    for (const item of data.items) {
      const button = document.createElement('button'); button.className = 'result'; button.setAttribute('role', 'listitem');
      const title = document.createElement('strong'); title.textContent = `${item.path.split('/').at(-1)} · line ${item.line}`;
      const path = document.createElement('small'); path.textContent = item.path;
      const text = document.createElement('small'); text.className = 'snippet'; text.textContent = item.text;
      button.append(title, path, text); button.onclick = () => navigate(item.path, item.line, $('search-input').value.trim()); fragment.append(button);
    }
    $('results').replaceChildren(fragment);
  }
  if (data.done) $('cancel-search').hidden = true;
};
$('more-results').onclick = () => { visible += 200; renderFiles(); };
async function loadText(entry) {
  const id = entry[2];
  if (!packs.has(id)) {
    packs.set(id, await unpack(`data/packs/${String(id).padStart(4, '0')}.json.gz`));
    if (packs.size > 12) packs.delete(packs.keys().next().value);
  }
  return packs.get(id)[entry[3]];
}
function position(offset, length = 0) {
  if(leanView)leanView.reveal(offset,length);
  else{reader.focus({preventScroll: true});reader.setSelectionRange(offset, offset + length);}
  const line = currentText.slice(0, offset).split('\n').length;
  const height = parseFloat(getComputedStyle(reader).lineHeight);
  reader.scrollTop = Math.max(0, (line - 1) * height - reader.clientHeight / 3);
  $('line-numbers').scrollTop = reader.scrollTop;
  $('line-input').value = line;
  $('document-position').textContent = `Line ${number(line)}`;
}
function goToLine(value) {
  const lines = currentText.split('\n');
  const line = Math.min(Math.max(1, Number(value) || 1), lines.length);
  let offset = 0;
  for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1;
  position(offset);
}
function findMatches(preserve = false) {
  matchOffsets = [];
  const query = $('find-input').value.toLowerCase();
  if (query) {
    const lower = currentText.toLowerCase();
    let at = -query.length;
    while ((at = lower.indexOf(query, at + Math.max(query.length, 1))) !== -1) matchOffsets.push(at);
  }
  selectedMatch = -1;
  $('find-count').textContent = query ? `${number(matchOffsets.length)} matches` : '';
  if (!preserve && matchOffsets.length) nextMatch(1);
}
function nextMatch(direction) {
  if (!matchOffsets.length) return;
  selectedMatch = selectedMatch < 0 ? (direction > 0 ? 0 : matchOffsets.length - 1) : (selectedMatch + direction + matchOffsets.length) % matchOffsets.length;
  position(matchOffsets[selectedMatch], $('find-input').value.length);
  $('find-count').textContent = `${number(selectedMatch + 1)} / ${number(matchOffsets.length)}`;
}
$('find-input').oninput = () => findMatches();
$('find-input').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); nextMatch(event.shiftKey ? -1 : 1); } };
$('find-next').onclick = () => nextMatch(1);
$('find-previous').onclick = () => nextMatch(-1);
$('go-line').onclick = () => goToLine($('line-input').value);
$('line-input').onkeydown = event => { if (event.key === 'Enter') goToLine(event.target.value); };
reader.onscroll = () => { $('line-numbers').scrollTop = reader.scrollTop; };
reader.onclick = reader.onkeyup = () => {
  const line = currentText.slice(0, reader.selectionStart).split('\n').length;
  $('line-input').value = line;
  $('document-position').textContent = `Line ${number(line)}`;
};
$('wrap-text').onchange = event => {
  leanView?.setWrap(event.target.checked);
  reader.wrap = event.target.checked ? 'soft' : 'off';
  reader.classList.toggle('wrap', event.target.checked);
  $('line-numbers').classList.toggle('hidden-gutter', event.target.checked);
};
$('copy-link').onclick = async () => {
  try {
    const url = new URL(location.href);
    url.hash = new URLSearchParams({file: currentPath, line: $('line-input').value});
    await navigator.clipboard.writeText(url.toString());
    $('copy-link').textContent = 'Copied'; setTimeout(() => $('copy-link').textContent = 'Copy link', 1500);
  } catch { error('Copy the address from your browser to share this file.'); }
};
async function route() {
  if (!manifest.length) return;
  const token = ++loadId;
  const params = new URLSearchParams(location.hash.slice(1));
  const path = params.get('file');
  if (params.get('view') === 'dependencies') {
    $('overview').hidden = true; $('document').hidden = true; $('dependencies').hidden = false;
    try { await dependencyExplorer.show(path || 'Main.txt'); } catch (problem) { error(problem.message); }
    return;
  }
  $('dependencies').hidden = true;
  if (!path) { $('overview').hidden = false; $('document').hidden = true; document.title='Riemann · Text archive'; requestAnimationFrame(()=>proofGuide?.redraw()); return; }
  const entry = lookup.get(path);
  if (!entry) { error('This file is not in the archive.'); return; }
  try {
    $('error').hidden = true;
    const text = await loadText(entry);
    if (token !== loadId) return;
    currentPath = path; currentText = text;
    $('overview').hidden = true; $('document').hidden = false;
    $('file-name').textContent = path.split('/').at(-1); $('file-path').textContent = path;
    reader.value = text;
    openTab(path);
    renderBreadcrumbs(path);
    repository?.reveal(path);
    const lineCount = text.split('\n').length;
    const displayLines = text.endsWith('\n') ? lineCount - 1 : lineCount;
    $('line-numbers').textContent = Array.from({length: displayLines}, (_, i) => i + 1).join('\n');
    $('document-info').textContent = `${number(entry[1])} lines · Lean syntax · read-only`;
    $('line-input').max = lineCount;
    if (downloadURL) URL.revokeObjectURL(downloadURL);
    downloadURL = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
    $('download-text').href = downloadURL; $('download-text').download = path.split('/').at(-1);
    $('download-lean').href = downloadURL; $('download-lean').download = path.split('/').at(-1).replace(/\.txt$/, '.lean');
    $('find-input').value = params.get('find') || ''; findMatches(true);
    let restored=false;
    try{
      if(!leanViewPromise){
        window.__leanReaderPhase='Loading editor module';
        $('lean-editor').hidden=false;$('text-surface').classList.add('editor-ready');
        const css=document.createElement('link');css.rel='stylesheet';css.href='assets/lean-editor.css';document.head.append(css);
        leanViewPromise=import('./assets/lean-editor.js').then(module=>module.createLeanReader($('lean-editor'),({line})=>{$('line-input').value=line;$('document-position').textContent=`Line ${number(line)}`;}));
      }
      leanView=await leanViewPromise;
      if(token!==loadId)return;
      restored=leanView.open(path,text);leanView.setWrap($('wrap-text').checked);
      requestAnimationFrame(()=>leanView.layout());
    }catch(problem){$('lean-editor').hidden=true;$('text-surface').classList.remove('editor-ready');error('Syntax reader could not load: '+problem.message);}
    if(params.has('line')||!restored)requestAnimationFrame(() => goToLine(params.get('line') || 1));
    if (mode() === 'files') renderFiles();
    document.title = `${path.split('/').at(-1)} · Riemann text archive`;
  } catch (problem) { error(problem.message); }
}
window.addEventListener('hashchange', route);
$('overview-button').onclick = () => { location.hash = ''; route(); };
function navigateDependencies(path = 'Main.txt') {
  const hash = '#' + new URLSearchParams({view:'dependencies',file:path});
  if (location.hash === hash) route(); else location.hash=hash;
}
$('dependencies-button').onclick = $('explore-dependencies').onclick = () => navigateDependencies(currentPath || 'Main.txt');
$('file-dependencies').onclick = () => navigateDependencies(currentPath || 'Main.txt');
$('repository-button').onclick=()=>{setSidebar('explorer');navigate(currentPath||'Main.txt');};
function setSidebar(view){
  const explorer=view==='explorer';
  $('explorer-panel').hidden=!explorer;$('search-panel').hidden=explorer;
  $('explorer-button').classList.toggle('selected',explorer);$('search-button').classList.toggle('selected',!explorer);
  $('explorer-button').setAttribute('aria-selected',explorer);$('search-button').setAttribute('aria-selected',!explorer);
  if(explorer&&currentPath)repository?.reveal(currentPath);
}
$('explorer-button').onclick=()=>setSidebar('explorer');
$('search-button').onclick=()=>{setSidebar('search');$('search-input').focus();};
function openTab(path){
  if(!openTabs.includes(path)){openTabs.push(path);if(openTabs.length>12){const removed=openTabs.shift();leanView?.close(removed);}}
  renderTabs();
}
function renderTabs(){
  const tabs=$('file-tabs');tabs.replaceChildren();
  for(const path of openTabs){
    const tab=document.createElement('div');tab.className='file-tab'+(path===currentPath?' selected':'');
    const button=document.createElement('button');button.setAttribute('role','tab');button.setAttribute('aria-selected',path===currentPath);button.textContent=path.split('/').at(-1);button.title=path;button.onclick=()=>navigate(path);
    const close=document.createElement('button');close.className='close-tab';close.textContent='×';close.setAttribute('aria-label','Close '+path.split('/').at(-1));close.onclick=()=>{const index=openTabs.indexOf(path);openTabs.splice(index,1);leanView?.close(path);if(path===currentPath){if(openTabs.length)navigate(openTabs[Math.min(index,openTabs.length-1)]);else{location.hash='';route();}}renderTabs();};
    tab.append(button,close);tabs.append(tab);
  }
}
function renderBreadcrumbs(path){
  const container=$('file-breadcrumbs');container.replaceChildren();
  const parts=['text',...path.split('/')];
  parts.forEach((part,i)=>{if(i){const separator=document.createElement('span');separator.className='breadcrumb-divider';separator.textContent='/';container.append(separator);}const label=document.createElement('span');label.textContent=part;container.append(label);});
}
document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => navigate(button.dataset.open));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); $('search-input').focus(); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'f' && !$('document').hidden) { event.preventDefault(); $('find-input').focus(); }
});
async function refreshVerification(stats) {
    try {
      const response=await fetch('data/metrics.json', {cache:'no-store'});
      if(response.ok){
        const metrics=await response.json();
        $('cpu-hours').textContent=Number(metrics.cpu_hours).toFixed(4);
        const seconds=metrics.wall_seconds;
        $('wall-time').textContent=seconds>=3600?(seconds/3600).toFixed(2)+' h':(seconds/60).toFixed(1)+' min';
        $('build-memory').textContent=(metrics.peak_aggregate_rss_bytes_sampled/1024**3).toFixed(2)+' GiB';
        $('timing-note').textContent=(metrics.status==='running'?'Compilation was still running at this snapshot. These are partial measurements, not a completed full-proof typecheck time. ':'The recorded verification attempt has ended; read its result above. ')+`CPU time is aggregate user + system time sampled for the verification process tree. Downloads and website generation are excluded. ${metrics.machine.logical_cpus} logical CPUs · ${metrics.machine.architecture}.`;
        $('timing-snapshot').textContent='Measurement snapshot: '+metrics.updated_at;
      }
    } catch { /* Pending remains accurate until a metric is available. */ }
    try {
      const response = await fetch('data/verification.json', {cache:'no-store'});
      if (response.ok) {
        const status = await response.json();
        $('verification-title').textContent = status.title;
        $('verification-detail').textContent = status.detail;
        $('verification-meta').textContent = `${stats.toolchain} · report time ${status.checked_at || 'not yet completed'}`;
      }
    } catch { /* The pending state remains visible if the report is unavailable. */ }
}
async function initialize() {
  try {
    fetch('data/site.json',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(site=>{if(!site)return;if(site.repository_url)document.querySelectorAll('.repo-link').forEach(link=>{link.href=site.repository_url;link.hidden=false;});if(site.our_certificate==='Available'){$('our-certificate-status').textContent='Available';$('our-certificate-download').href=site.certificate_url;$('our-certificate-download').hidden=false;}}).catch(()=>{});
    const statsResponse = await fetch('data/stats.json');
    if (!statsResponse.ok) throw new Error('Could not load archive statistics.');
    const stats = await statsResponse.json();
    proofGuide = initializeProofGuide(navigate);
    $('stat-lines').textContent = number(stats.lines); $('stat-files').textContent = number(stats.files); $('stat-nonblank').textContent = number(stats.nonblank_lines);
    $('archive-size').textContent = `${number(stats.files)} files · ${number(stats.lines)} lines`;
    for (const [name, group] of Object.entries(stats.groups)) {
      const row = document.createElement('div'); row.className = 'group';
      const label = document.createElement('span'); label.textContent = name;
      const count = document.createElement('span'); count.textContent = `${number(group.files)} files · ${number(group.lines)} lines`;
      row.append(label, count); $('groups').append(row);
    }
    const summaryResponse = await fetch('data/dependencies.json');
    if (!summaryResponse.ok) throw new Error('Could not load dependency statistics.');
    const summary = await summaryResponse.json();
    const counts = stats.declaration_counts_textual;
    const extra = [
      [number(counts.theorem || 0), 'theorem declarations'],
      [number(counts.lemma || 0), 'lemma declarations'],
      [number((counts.theorem || 0) + (counts.lemma || 0)), 'theorems + lemmas'],
      [number(counts.def || 0), 'def declarations'],
      [number((counts.structure || 0) + (counts.class || 0)), 'structures + classes'],
      [number(counts.instance || 0), 'instance declarations'],
      [number(summary.internal_import_edges), 'project import edges'],
      [number(summary.main_import_closure_files), 'files reachable from Main'],
      [(stats.bytes / 1_000_000_000).toFixed(3) + ' GB', 'uncompressed source text']
    ];
    for (const [value,label] of extra) { const card=document.createElement('div'); const strong=document.createElement('strong');strong.textContent=value; const span=document.createElement('span');span.textContent=label;card.append(strong,span);$('extra-stats').append(card); }
    const note=document.createElement('p');note.className='count-note';note.textContent='Declaration counts are textual source counts. They are not a count of declarations successfully checked by Lean.';$('extra-stats').after(note);
    renderGroupWeb(summary,stats,group=>{document.querySelector('input[value=files]').checked=true;stopSearch();$('search-input').value=group;searchFiles();});
    renderDependencyLayers(summary,navigate);
    $('dependency-summary').textContent=`${number(summary.nodes)} project modules · ${number(summary.internal_import_edges)} internal import edges · ${number(summary.main_import_cycles_detected)} import cycles detected in Main’s closure. All source files are reachable from Main.`;
    await refreshVerification(stats);
    setInterval(() => refreshVerification(stats), 10000);
    manifest = await unpack('data/manifest.json.gz');
    lookup = new Map(manifest.map(entry => [entry[0], entry]));
    dependencyExplorer = createDependencyExplorer(manifest,unpack,navigate,navigateDependencies);
    repository=createRepositoryExplorer(manifest,navigate);
    createSourceTreemap(manifest,summary,navigate);
    searchFiles(); await route();
  } catch (problem) { error(problem.message); $('result-count').textContent = 'Archive could not load.'; }
}
initialize();

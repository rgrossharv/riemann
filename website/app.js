import {initializeProofGuide, renderGroupWeb, renderDependencyLayers, createDependencyExplorer} from './proof-guide.js';
import {createRepositoryExplorer} from './repository.js';
import {createSourceTreemap} from './source-visuals.js';
const $ = id => document.getElementById(id);
const number = n => Number(n).toLocaleString('en-US');
let manifest = [], lookup = new Map(), filtered = [], visible = 120;
let currentPath = '', currentText = '', downloadURL = '', loadId = 0;
let matchOffsets = [], selectedMatch = -1, searchId = 0;
const packs = new Map();
const reader = $('plain-text');
const searchDialog = $('archive-search');
let worker, archivePromise, statisticsPromise, siteDetailsPromise;
let inputTimer;
let dependencyExplorer, proofGuide;
let repository, leanView, leanViewPromise;
const recentFiles = [];
window.MonacoEnvironment={getWorker:()=>new Worker(new URL('./assets/editor-worker.js',import.meta.url),{type:'module'})};
function error(message) { $('error').textContent = message; $('error').hidden = false; }
async function unpack(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const blob = new Blob([bytes]);
  const stream = bytes[0] === 31 && bytes[1] === 139 ? blob.stream().pipeThrough(new DecompressionStream('gzip')) : blob.stream();
  return JSON.parse(await new Response(stream).text());
}
function loadArchive() {
  archivePromise ??= unpack('data/manifest.json.gz').then(entries => {
    manifest = entries;
    lookup = new Map(entries.map(entry => [entry[0], entry]));
    $('archive-size').textContent = `${number(entries.length)} files`;
  }).catch(problem => {
    archivePromise = undefined;
    throw problem;
  });
  return archivePromise;
}
function navigate(path, line = null, find = '') {
  if (searchDialog.open) searchDialog.close();
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
async function searchFiles() {
  try {
    await loadArchive();
  } catch (problem) {
    $('result-count').textContent = problem.message;
    return;
  }
  if (mode() !== 'files') return;
  const query = $('search-input').value.trim().toLowerCase().replace(/\.lean$/, '.txt');
  filtered = [];
  for (let id = 0; id < manifest.length; id++) if (manifest[id][0].toLowerCase().includes(query)) filtered.push(id);
  // Keep the main statements easy to find in the initial list.
  if (!query) filtered.sort((a, b) => (manifest[a][0] === 'Main.txt' ? -1 : manifest[b][0] === 'Main.txt' ? 1 : manifest[a][0] === 'Statements.txt' ? -1 : manifest[b][0] === 'Statements.txt' ? 1 : 0));
  visible = 120;
  renderFiles();
}
function stopSearch() {
  worker?.postMessage({type: 'cancel'});
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
  if (!worker) {
    worker = new Worker('search-worker.js');
    worker.onmessage = showSearchResults;
  }
  worker.postMessage({type: 'search', id: ++searchId, query});
};
function showSearchResults(event) {
  const data = event.data;
  if (data.id !== searchId) return;
  if (data.type === 'error') { $('cancel-search').hidden = true; $('result-count').textContent = data.message; return; }
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
}
$('more-results').onclick = () => { visible += 200; renderFiles(); };
function openSearch() {
  if (!searchDialog.open) searchDialog.showModal();
  $('search-input').focus();
  if (mode() === 'files') searchFiles();
}
$('search-button').onclick = openSearch;
$('close-search').onclick = () => searchDialog.close();
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
function showView(view) {
  const workspace = view === 'code' || view === 'dependencies';
  if (document.body.dataset.view !== view) {
    document.body.dataset.view = view;
    $('reading-pane').scrollTop = 0;
    window.scrollTo(0, 0);
  }
  $('landing').hidden = view !== 'home';
  $('reading-pane').hidden = view === 'home';
  $('workspace-sidebar').hidden = !workspace;
  $('overview').hidden = view !== 'statistics';
  $('extras-page').hidden = view !== 'extras';
  $('dependencies').hidden = view !== 'dependencies';
  $('document').hidden = view !== 'code' || !currentPath;
  $('empty-reader').hidden = view !== 'code' || Boolean(currentPath);
  for (const [id, active] of [
    ['repository-button', workspace],
    ['overview-button', view === 'statistics'],
    ['extras-link', view === 'extras'],
  ]) {
    if (active) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
}

async function route() {
  const token = ++loadId;
  const hash = location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const view = params.get('view');
  const path = params.get('file') || (hash === 'code' ? currentPath || 'Main.txt' : '');
  $('error').hidden = true;
  try {
    if (hash === 'extras') {
      showView('extras');
      document.title = 'Extras · Riemann Archive';
      loadSiteDetails();
      return;
    }
    if (hash === 'statistics') {
      showView('statistics');
      document.title = 'Statistics · Riemann Archive';
      statisticsPromise ??= initializeStatistics();
      await statisticsPromise;
      if (token === loadId) redrawProofGuide();
      return;
    }
    if (!path && view !== 'code' && view !== 'dependencies') {
      showView('home');
      document.title = 'Riemann Hypothesis';
      return;
    }

    const dependencies = view === 'dependencies';
    showView(dependencies ? 'dependencies' : 'code');
    document.title = dependencies ? 'Dependencies · Riemann Archive' : 'Code · Riemann Archive';
    await loadArchive();
    if (token !== loadId) return;
    repository ??= createRepositoryExplorer(manifest, navigate);
    if (dependencies) {
      dependencyExplorer ??= createDependencyExplorer(manifest, unpack, navigate, navigateDependencies);
      await dependencyExplorer.show(path || 'Main.txt');
      return;
    }
    if (!path) {
      $('document').hidden = true;
      $('empty-reader').hidden = false;
      return;
    }
    const entry = lookup.get(path);
    if (!entry) throw new Error('This file is not in the archive.');

    const text = await loadText(entry);
    if (token !== loadId) return;
    currentPath = path; currentText = text;
    $('empty-reader').hidden = true;
    $('document').hidden = false;
    $('file-name').textContent = path.split('/').at(-1);
    reader.value = text;
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
      const lastOpened = recentFiles.indexOf(path);
      if (lastOpened !== -1) recentFiles.splice(lastOpened, 1);
      recentFiles.push(path);
      if (recentFiles.length > 12) leanView.close(recentFiles.shift());
      requestAnimationFrame(()=>leanView.layout());
    }catch(problem){
      if (token !== loadId) return;
      $('lean-editor').hidden=true;
      $('text-surface').classList.remove('editor-ready');
      error('Syntax reader could not load: '+problem.message);
    }
    if(params.has('line')||!restored)requestAnimationFrame(() => {
      if (token === loadId) goToLine(params.get('line') || 1);
    });
    document.title = `${path.split('/').at(-1)} · Riemann Archive`;
  } catch (problem) { if (token === loadId) error(problem.message); }
}
window.addEventListener('hashchange', route);
function navigateDependencies(path = 'Main.txt') {
  const hash = '#' + new URLSearchParams({view:'dependencies',file:path});
  if (location.hash === hash) route(); else location.hash=hash;
}
$('explore-dependencies').onclick = () => navigateDependencies(currentPath || 'Main.txt');
$('file-dependencies').onclick = () => navigateDependencies(currentPath || 'Main.txt');
function renderBreadcrumbs(path){
  const container=$('file-breadcrumbs');container.replaceChildren();
  const parts=['text',...path.split('/')];
  parts.forEach((part,i)=>{if(i){const separator=document.createElement('span');separator.className='breadcrumb-divider';separator.textContent='/';container.append(separator);}const label=document.createElement('span');label.textContent=part;container.append(label);});
}
document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => navigate(button.dataset.open));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); openSearch(); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'f' && !searchDialog.open && !$('document').hidden) { event.preventDefault(); $('find-input').focus(); }
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
const statisticsTabs = [...document.querySelectorAll('.statistics-tabs [role="tab"]')];
let statisticsIndex = 0;

function redrawProofGuide() {
  if (document.body.dataset.view === 'statistics' && !$('statistics-dependencies').hidden) {
    requestAnimationFrame(() => proofGuide?.redraw());
  }
}

function selectStatistics(index) {
  if (index < 0 || index >= statisticsTabs.length || index === statisticsIndex) return;
  const currentTab = statisticsTabs[statisticsIndex];
  const nextTab = statisticsTabs[index];
  const panel = $(nextTab.getAttribute('aria-controls'));
  $(currentTab.getAttribute('aria-controls')).hidden = true;
  currentTab.setAttribute('aria-selected', 'false');
  currentTab.tabIndex = -1;
  nextTab.setAttribute('aria-selected', 'true');
  nextTab.tabIndex = 0;
  panel.dataset.direction = index < statisticsIndex ? 'previous' : 'next';
  panel.hidden = false;
  statisticsIndex = index;
  $('statistics-previous').disabled = index === 0;
  $('statistics-next').disabled = index === statisticsTabs.length - 1;
  nextTab.scrollIntoView({block: 'nearest', inline: 'nearest'});
  redrawProofGuide();
}

statisticsTabs.forEach((tab, index) => {
  tab.onclick = () => selectStatistics(index);
  tab.onkeydown = event => {
    const targets = {ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: statisticsTabs.length - 1};
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    if (!statisticsTabs[target]) return;
    selectStatistics(target);
    statisticsTabs[target].focus();
  };
});
$('statistics-previous').onclick = () => selectStatistics(statisticsIndex - 1);
$('statistics-next').onclick = () => selectStatistics(statisticsIndex + 1);

async function readReport(name) {
  const response = await fetch(`data/${name}.json`);
  if (!response.ok) throw new Error(`Could not load the ${name} report.`);
  return response.json();
}

function loadSiteDetails() {
  siteDetailsPromise ??= fetch('data/site.json', {cache: 'no-store'})
    .then(response => response.ok ? response.json() : null)
    .then(site => {
      if (site?.repository_url) {
        document.querySelectorAll('.repo-link').forEach(link => {
          link.href = site.repository_url;
          link.hidden = false;
        });
      }
      if (site?.our_certificate === 'Available' && site.certificate_url) {
        $('our-certificate-status').textContent = 'Available';
        $('our-certificate-download').href = site.certificate_url;
        $('our-certificate-download').hidden = false;
      }
    })
    .catch(() => {});
}

async function initializeStatistics() {
    const [stats, summary] = await Promise.all([readReport('stats'), readReport('dependencies'), loadArchive()]);
    loadSiteDetails();
    proofGuide = initializeProofGuide(navigate);
    $('stat-lines').textContent = number(stats.lines); $('stat-files').textContent = number(stats.files); $('stat-nonblank').textContent = number(stats.nonblank_lines);
    for (const [name, group] of Object.entries(stats.groups)) {
      const row = document.createElement('div'); row.className = 'group';
      const label = document.createElement('span'); label.textContent = name;
      const count = document.createElement('span'); count.textContent = `${number(group.files)} files · ${number(group.lines)} lines`;
      row.append(label, count); $('groups').append(row);
    }
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
    renderGroupWeb(summary, stats, group => {
      document.querySelector('input[value=files]').checked = true;
      stopSearch();
      $('search-input').value = group;
      openSearch();
    });
    renderDependencyLayers(summary,navigate);
    $('dependency-summary').textContent=`${number(summary.nodes)} project modules · ${number(summary.internal_import_edges)} internal import edges · ${number(summary.main_import_cycles_detected)} import cycles detected in Main’s closure. All source files are reachable from Main.`;
    refreshVerification(stats);
    setInterval(() => refreshVerification(stats), 10000);
    createSourceTreemap(manifest,summary,navigate);
}
route();

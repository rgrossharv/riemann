import {renderGroupWeb, renderDependencyLayers, createDependencyExplorer} from './proof-guide.js';
import {createRepositoryExplorer} from './repository.js';
import {createSourceTreemap} from './source-visuals.js';
import {archivePath, leanPath} from './archive-paths.js';
const $ = id => document.getElementById(id);
const number = n => Number(n).toLocaleString('en-US');
const filePageSize = 40;
let manifest = [], lookup = new Map(), filtered = [], visible = filePageSize;
let currentPath = '', currentText = '', downloadURL = '', loadId = 0;
let matchOffsets = [], selectedMatch = -1, searchId = 0;
const packs = new Map();
const reader = $('plain-text');
const entryView = document.body.dataset.view;
const entryTitle = document.title;
const themeButton = $('theme-button');
const themeRoot = document.documentElement;
let worker, archivePromise, statisticsPromise, siteDetailsPromise;
let inputTimer;
let dependencyExplorer;
let repository, leanView, leanViewPromise;
const recentFiles = [];

function applyTheme(light) {
  themeRoot.classList.toggle('light', light);
  document.body.classList.toggle('light', light);
  themeButton.setAttribute('aria-pressed', String(light));
  themeButton.title = light ? 'Switch to dark mode' : 'Switch to light mode';
}

applyTheme(themeRoot.classList.contains('light'));
themeButton.onclick = () => {
  const light = !themeRoot.classList.contains('light');
  applyTheme(light);
  try {
    localStorage.setItem('riemann-theme', light ? 'light' : 'dark');
  } catch {}
};
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    try {
      applyTheme(localStorage.getItem('riemann-theme') === 'light');
    } catch {}
  }
});

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
  const params = new URLSearchParams({file: leanPath(path)});
  if(line!==null)params.set('line',String(line));
  if (find) params.set('find', find);
  navigateCode(params);
}
function navigateCode(params) {
  const target = new URL('code.html', location.href);
  target.hash = params;
  if (location.pathname !== target.pathname) location.assign(target);
  else if (location.hash === target.hash) route();
  else location.hash = target.hash;
}
function renderFiles() {
  const fragment = document.createDocumentFragment();
  for (const id of filtered.slice(0, visible)) {
    const entry = manifest[id];
    const path = leanPath(entry[0]);
    const button = document.createElement('button');
    button.className = 'result' + (entry[0] === currentPath ? ' active' : '');
    button.setAttribute('role', 'listitem');
    const title = document.createElement('strong');
    title.textContent = path.split('/').at(-1);
    const sub = document.createElement('small');
    sub.textContent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : 'Entry point';
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
  const query = leanPath($('search-input').value.trim().toLowerCase());
  filtered = [];
  for (let id = 0; id < manifest.length; id++) if (leanPath(manifest[id][0]).toLowerCase().includes(query)) filtered.push(id);
  // Keep the main statements easy to find in the initial list.
  if (!query) filtered.sort((a, b) => (manifest[a][0] === 'Main.txt' ? -1 : manifest[b][0] === 'Main.txt' ? 1 : manifest[a][0] === 'Statements.txt' ? -1 : manifest[b][0] === 'Statements.txt' ? 1 : 0));
  visible = filePageSize;
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
      const displayPath = leanPath(item.path);
      const title = document.createElement('strong'); title.textContent = `${displayPath.split('/').at(-1)} · line ${item.line}`;
      const path = document.createElement('small'); path.textContent = displayPath;
      const text = document.createElement('small'); text.className = 'snippet'; text.textContent = item.text;
      button.append(title, path, text); button.onclick = () => navigate(item.path, item.line, $('search-input').value.trim()); fragment.append(button);
    }
    $('results').replaceChildren(fragment);
  }
  if (data.done) $('cancel-search').hidden = true;
}
$('more-results').onclick = () => { visible += filePageSize; renderFiles(); };
function openSearch(filter) {
  if (document.body.dataset.view === 'search' && filter === undefined) {
    $('search-input').focus();
    return;
  }
  const target = new URL('search.html', location.href);
  if (filter) target.searchParams.set('file', filter);
  location.assign(target);
}
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
    const url = new URL('code.html', location.href);
    url.hash = new URLSearchParams({file: leanPath(currentPath), line: $('line-input').value});
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
  $('theorem-page').hidden = view !== 'theorem';
  $('search-page').hidden = view !== 'search';
  $('dependencies').hidden = view !== 'dependencies';
  $('document').hidden = view !== 'code' || !currentPath;
  $('empty-reader').hidden = view !== 'code' || Boolean(currentPath);
  for (const [id, active] of [
    ['repository-button', workspace],
    ['overview-button', view === 'statistics'],
    ['extras-link', view === 'extras'],
    ['theorem-link', view === 'theorem'],
    ['search-button', view === 'search'],
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
  const file = archivePath(params.get('file') || '');
  const legacyPage = ['code', 'extras', 'search', 'statistics', 'theorem'].includes(hash) ? hash : null;
  const page = file || view === 'code' || view === 'dependencies' ? 'code' : legacyPage || entryView;
  const path = file || (page === 'code' && !view ? currentPath || 'Main.txt' : '');
  $('error').hidden = true;
  try {
    if (page !== 'code') {
      showView(page);
      const fallbackTitles = {
        home: 'Riemann Hypothesis', extras: 'Extras', search: 'Search the Lean archive',
        statistics: 'Proof statistics', theorem: 'Riemann Hypothesis statement',
      };
      document.title = page === entryView ? entryTitle : fallbackTitles[page] + ' · Riemann Archive';
      if (page === 'extras') loadSiteDetails();
      if (page === 'search') {
        $('search-input').focus({preventScroll: true});
        if (mode() === 'files') await searchFiles();
      }
      if (page === 'statistics') {
        statisticsPromise ??= initializeStatistics();
        await statisticsPromise;
      }
      return;
    }

    const dependencies = view === 'dependencies';
    showView(dependencies ? 'dependencies' : 'code');
    document.title = dependencies ? 'Dependencies · Riemann Archive' : entryView === 'code' ? entryTitle : 'Lean proof code · Riemann Archive';
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
    const displayPath = leanPath(path);
    const fileName = displayPath.split('/').at(-1);
    $('file-name').textContent = fileName;
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
    $('download-lean').href = downloadURL; $('download-lean').download = fileName;
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
      restored=leanView.open(displayPath,text);leanView.setWrap($('wrap-text').checked);
      const lastOpened = recentFiles.indexOf(path);
      if (lastOpened !== -1) recentFiles.splice(lastOpened, 1);
      recentFiles.push(path);
      if (recentFiles.length > 12) leanView.close(leanPath(recentFiles.shift()));
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
    if (path !== 'Main.txt') document.title = `${fileName} · Riemann Archive`;
  } catch (problem) { if (token === loadId) error(problem.message); }
}
window.addEventListener('hashchange', route);
function navigateDependencies(path = 'Main.txt') {
  navigateCode(new URLSearchParams({view:'dependencies',file:leanPath(path)}));
}
$('explore-dependencies').onclick = () => navigateDependencies(currentPath || 'Main.txt');
$('file-dependencies').onclick = () => navigateDependencies(currentPath || 'Main.txt');
function renderBreadcrumbs(path){
  const container=$('file-breadcrumbs');container.replaceChildren();
  const parts=['text',...leanPath(path).split('/')];
  parts.forEach((part,i)=>{if(i){const separator=document.createElement('span');separator.className='breadcrumb-divider';separator.textContent='/';container.append(separator);}const label=document.createElement('span');label.textContent=part;container.append(label);});
}
document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => navigate(button.dataset.open));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); openSearch(); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'f' && !$('document').hidden) { event.preventDefault(); $('find-input').focus(); }
});
const statisticsSelector = $('statistics-card-select');
const statisticsCards = Array.from(statisticsSelector.options, option => $(option.value));
let statisticsIndex = 0;
$('statistics-position').textContent = `1 of ${statisticsCards.length}`;

function selectStatistics(index) {
  const card = statisticsCards[index];
  if (!card || index === statisticsIndex) return;
  statisticsCards[statisticsIndex].hidden = true;
  card.dataset.direction = index < statisticsIndex ? 'previous' : 'next';
  card.hidden = false;
  statisticsIndex = index;
  statisticsSelector.selectedIndex = index;
  $('statistics-position').textContent = `${index + 1} of ${statisticsCards.length}`;
  $('statistics-previous').disabled = index === 0;
  $('statistics-next').disabled = index === statisticsCards.length - 1;
}

statisticsSelector.onchange = () => selectStatistics(statisticsSelector.selectedIndex);
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
    $('stat-lines').textContent = number(stats.lines); $('stat-files').textContent = number(stats.files); $('stat-nonblank').textContent = number(stats.nonblank_lines);
    $('stat-bytes').textContent = `${(stats.bytes / 1_000_000_000).toFixed(3)} GB`;
    const counts = stats.declaration_counts_textual;
    const declarations = [
      ['Theorems', counts.theorem],
      ['Lemmas', counts.lemma],
      ['Definitions', counts.def],
      ['Structures', counts.structure],
      ['Classes', counts.class],
      ['Instances', counts.instance],
    ];
    for (const [label, count] of declarations) {
      const metric = document.createElement('div');
      const name = document.createElement('dt');
      const value = document.createElement('dd');
      name.textContent = label;
      value.textContent = number(count ?? 0);
      metric.append(name, value);
      $('declaration-stats').append(metric);
    }
    renderGroupWeb(summary, stats, openSearch);
    renderDependencyLayers(summary,navigate);
    $('dependency-summary').textContent = `${number(summary.internal_import_edges)} imports across ${number(summary.nodes)} modules · ${number(summary.main_import_closure_files)} reachable from Main.lean · ${number(summary.main_import_cycles_detected)} cycles detected`;
    createSourceTreemap(manifest,summary,navigate);
}
if (entryView === 'search') $('search-input').value = new URLSearchParams(location.search).get('file') || '';
route();

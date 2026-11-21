let generation = 0;
let manifestPromise;
const shards = new Map();
const packs = new Map();
async function unpack(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const blob = new Blob([bytes]);
  const stream = bytes[0] === 31 && bytes[1] === 139 ? blob.stream().pipeThrough(new DecompressionStream('gzip')) : blob.stream();
  return JSON.parse(await new Response(stream).text());
}
async function getPack(id) {
  if (packs.has(id)) return packs.get(id);
  const value = await unpack(`data/packs/${String(id).padStart(4, '0')}.json.gz`);
  packs.set(id, value);
  if (packs.size > 12) packs.delete(packs.keys().next().value);
  return value;
}
async function postings(word) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(word)));
  const shard = digest[0].toString(16).padStart(2, '0');
  if (!shards.has(shard)) {
    shards.set(shard, await unpack(`data/index/${shard}.json.gz`));
    if (shards.size > 12) shards.delete(shards.keys().next().value);
  }
  const deltas = shards.get(shard)[word];
  if (!Array.isArray(deltas)) return [];
  let previous = 0;
  return deltas.map(delta => previous += delta);
}
const isWord = char => !!char && /[\p{L}\p{N}_]/u.test(char);
function matches(text, needle) {
  const lower = text.toLowerCase();
  const result = [];
  const seenLines = new Set();
  let index = -1;
  while ((index = lower.indexOf(needle, index + 1)) !== -1) {
    if (isWord(needle[0]) && isWord(lower[index - 1])) continue;
    if (isWord(needle.at(-1)) && isWord(lower[index + needle.length])) continue;
    const before = text.slice(0, index);
    const line = before.split('\n').length;
    if (seenLines.has(line)) continue;
    seenLines.add(line);
    const start = before.lastIndexOf('\n') + 1;
    let end = text.indexOf('\n', index);
    if (end < 0) end = text.length;
    result.push({line, text: text.slice(start, end).slice(0, 700)});
    if (result.length >= 8) break;
  }
  return result;
}
self.onmessage = async event => {
  const current = ++generation;
  if (event.data.type === 'cancel') return;
  const {id, query} = event.data;
  try {
    manifestPromise ||= unpack('data/manifest.json.gz');
    const manifest = await manifestPromise;
    const needle = query.toLowerCase();
    const terms = [...new Set(needle.match(/[\p{L}\p{N}_]{2,}/gu) || [])];
    let candidates;
    if (terms.length) {
      const lists = [];
      for (const term of terms) {
        lists.push(await postings(term));
        if (current !== generation) return;
      }
      lists.sort((a, b) => a.length - b.length);
      candidates = lists.shift();
      for (const list of lists) {
        const available = new Set(list);
        candidates = candidates.filter(value => available.has(value));
      }
    } else candidates = manifest.map((_, i) => i);
    let scanned = 0;
    let items = [];
    let previousPack = -1;
    const total = candidates.length;
    self.postMessage({id, type: 'progress', scanned, total});
    for (const file of candidates) {
      if (current !== generation) return;
      const entry = manifest[file];
      const pack = await getPack(entry[2]);
      if (current !== generation) return;
      for (const match of matches(pack[entry[3]], needle)) {
        items.push({file, path: entry[0], ...match});
        if (items.length >= 200) break;
      }
      scanned++;
      if (entry[2] !== previousPack || items.length >= 200 || scanned === total) {
        self.postMessage({id, type: 'results', items, scanned, total, done: scanned === total || items.length >= 200, truncated: items.length >= 200});
        previousPack = entry[2];
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (items.length >= 200) return;
    }
    self.postMessage({id, type: 'results', items, scanned, total, done: true});
  } catch (error) {
    if (current === generation) self.postMessage({id, type: 'error', message: error.message});
  }
};

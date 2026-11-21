import {renderLayerProfile} from './source-visuals.js';
import {archivePath, leanPath} from './archive-paths.js';
const svgNS = 'http://www.w3.org/2000/svg';
const element = (tag, attrs = {}) => {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
};
const number = value => Number(value).toLocaleString('en-US');

export function renderGroupWeb(summary, stats, chooseGroup) {
  const svg = document.getElementById('group-web');
  const groups = Object.keys(stats.groups);
  const points = new Map();
  const cx = 400, cy = 245, radius = 174;
  const largest = Math.max(...Object.values(stats.groups).map(group=>group.lines));
  groups.forEach((name, i) => { const angle = i * 2 * Math.PI / groups.length - Math.PI / 2; points.set(name,[cx + radius*Math.cos(angle),cy+radius*Math.sin(angle)]); });
  for (const [from,to,count] of summary.group_edges) {
    if (from === to || !points.has(from) || !points.has(to)) continue;
    const [x1,y1] = points.get(from), [x2,y2] = points.get(to);
    const path = element('path',{d:`M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}`,class:'group-edge','stroke-width':1,'data-from':from,'data-to':to});
    const title = element('title'); title.textContent = `${from} imports ${to}: ${number(count)} module edges`; path.append(title); svg.append(path);
  }
  groups.forEach((name,i) => {
    const [x,y]=points.get(name), count=stats.groups[name].files;
    const lines=stats.groups[name].lines;
    const nodeRadius=58*Math.sqrt(lines/largest);
    const node=element('g',{class:'group-node',tabindex:0,role:'button','aria-label':`Browse ${name}, ${number(count)} files`});
    const circle=element('circle',{cx:x,cy:y,r:nodeRadius,'data-lines':lines});
    const hit=element('circle',{cx:x,cy:y,r:Math.max(20,nodeRadius),class:'group-hit'});
    const angle=i*2*Math.PI/groups.length-Math.PI/2;
    const offset=nodeRadius+16;
    const label=element('text',{x:x+Math.cos(angle)*offset,y:y+Math.sin(angle)*offset,'text-anchor':Math.cos(angle)>.2?'start':Math.cos(angle)<-.2?'end':'middle','dominant-baseline':'middle'});label.textContent=name;
    const title=element('title');title.textContent=`${name}: ${number(lines)} source lines in ${number(count)} files. Circle area is proportional to lines. Click to browse.`;
    node.append(hit,circle,label,title);
    node.onclick=()=>chooseGroup(name==='Entry points'?'':name+'/');
    node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();node.onclick();}};
    node.onmouseenter=()=>svg.querySelectorAll('.group-edge').forEach(edge=>edge.classList.toggle('highlight',edge.dataset.from===name||edge.dataset.to===name));
    node.onmouseleave=()=>svg.querySelectorAll('.group-edge').forEach(edge=>edge.classList.remove('highlight'));
    svg.append(node);
  });
}

export function renderDependencyLayers(summary, openFile) {
  const layers=summary.layers;
  const largest=Math.max(...layers.map(layer=>layer.lines));
  const groups=[...new Set(layers.flatMap(layer=>Object.keys(layer.groups)))];
  const colors=['#80d8bb','#8ebbe8','#b7a3e7','#e2b77e','#76b9c5','#c0cc81','#d88d9c','#a6b4c4','#dfc4b6','#82a69e'];
  const color=new Map(groups.map((group,i)=>[group,colors[i%colors.length]]));
  const legend=document.getElementById('layer-legend');
  for(const group of groups){const item=document.createElement('span');const dot=document.createElement('i');dot.style.background=color.get(group);item.append(dot,document.createTextNode(group));legend.append(item);}
  const ticks=document.getElementById('layer-axis');
  for(let i=0;i<=4;i++){const tick=document.createElement('span');tick.textContent=number(Math.round(largest*i/4));ticks.append(tick);}
  const chart=document.getElementById('layer-bars');
  let profile,currentDepth=0;
  for(const layer of layers){
    const row=document.createElement('button');row.className='layer-row';row.dataset.depth=layer.depth;row.dataset.lines=layer.lines;
    row.setAttribute('aria-label',`Layer ${layer.depth}, ${number(layer.lines)} lines in ${number(layer.files)} files. Inspect breakdown.`);
    const label=document.createElement('span');label.className='layer-depth';label.textContent=String(layer.depth);
    const track=document.createElement('span');track.className='layer-track';
    const bar=document.createElement('span');bar.className='layer-bar';bar.style.width=(100*layer.lines/largest)+'%';bar.dataset.lines=layer.lines;
    for(const [group,lines] of Object.entries(layer.groups)){const segment=document.createElement('span');segment.style.width=(100*lines/layer.lines)+'%';segment.style.background=color.get(group);segment.title=`${group}: ${number(lines)} lines`;segment.dataset.group=group;segment.dataset.lines=lines;bar.append(segment);}
    track.append(bar);
    const value=document.createElement('span');value.className='layer-value';value.textContent=number(layer.lines);
    row.append(label,track,value);row.onclick=()=>select(layer);chart.append(row);
  }
  document.getElementById('layer-total').textContent=`${number(summary.layer_total_lines)} unique source lines · ${number(summary.layer_total_files)} files · ${number(layers.length)} layers. The total exactly matches the source line count.`;
  profile=renderLayerProfile(summary,select);
  document.getElementById('profile-previous').onclick=()=>select(layers[Math.max(0,currentDepth-1)]);
  document.getElementById('profile-next').onclick=()=>select(layers[Math.min(layers.length-1,currentDepth+1)]);
  select(layers.reduce((a,b)=>a.lines>b.lines?a:b));
  function select(layer){
    currentDepth=layer.depth;profile?.select(layer.depth);
    document.getElementById('profile-hover').textContent=`Layer ${layer.depth} · ${number(layer.lines)} lines · ${number(layer.files)} files`;
    document.getElementById('profile-previous').disabled=layer.depth===0;
    document.getElementById('profile-next').disabled=layer.depth===layers.length-1;
    for(const row of chart.children){const active=Number(row.dataset.depth)===layer.depth;row.classList.toggle('selected',active);row.setAttribute('aria-pressed',active);}
    document.getElementById('layer-detail-title').textContent=`Layer ${layer.depth} · ${number(layer.lines)} lines · ${number(layer.files)} files`;
    const breakdown=document.getElementById('layer-breakdown');breakdown.replaceChildren();
    for(const [group,lines] of Object.entries(layer.groups).sort((a,b)=>b[1]-a[1])){const row=document.createElement('div');const label=document.createElement('span');label.textContent=group;const value=document.createElement('span');value.textContent=`${number(lines)} lines (${(100*lines/layer.lines).toFixed(2)}%)`;row.append(label,value);breakdown.append(row);}
    const files=document.getElementById('layer-largest-files');files.replaceChildren();
    for(const [path,lines] of layer.largest_files){const button=document.createElement('button');button.textContent=`${leanPath(path)} · ${number(lines)} lines`;button.onclick=()=>openFile(path);files.append(button);}
  }
}

export function createDependencyExplorer(manifest, unpack, openFile, navigateDependencies) {
  let graphPromise;
  let selectedEntry;
  const lookup = new Map(manifest.map((item,id)=>[item[0],id]));
  const svg = document.getElementById('module-web');
  const input = document.getElementById('dependency-input');
  const searchResults=document.getElementById('dependency-suggestions');
  input.oninput=()=>{
    const q=leanPath(input.value.trim().toLowerCase());
    searchResults.replaceChildren();
    if(!q)return;
    const matches=manifest.filter(entry=>leanPath(entry[0]).toLowerCase().includes(q)).slice(0,8);
    for(const entry of matches){const button=document.createElement('button');button.textContent=leanPath(entry[0]);button.onclick=()=>{input.value=leanPath(entry[0]);searchResults.replaceChildren();navigateDependencies(entry[0]);};searchResults.append(button);}
  };
  document.getElementById('dependency-form').onsubmit=event=>{event.preventDefault();const path=archivePath(input.value.trim());if(lookup.has(path)){searchResults.replaceChildren();navigateDependencies(path);}else input.dispatchEvent(new Event('input'));};
  async function show(path='Main.txt') {
    const token=selectedEntry=path;
    const id=lookup.get(path);
    if(id===undefined)throw new Error('Unknown file in dependency explorer.');
    input.value=leanPath(path);searchResults.replaceChildren();
    document.getElementById('dependency-selected').textContent=leanPath(path);
    document.getElementById('dependency-counts').textContent='Loading the module graph…';
    graphPromise ||= unpack('data/graph.json.gz');
    const graph=await graphPromise;
    if(token!==selectedEntry)return;
    const dependencies=graph.imports[id], dependents=graph.imported_by[id];
    document.getElementById('dependency-counts').textContent=`${number(dependencies.length)} direct project imports · ${number(dependents.length)} direct importers · layer ${graph.depth_from_main[id]} from Main`;
    document.getElementById('dependency-read').onclick=()=>openFile(path);
    fillList('imports-list',dependencies);fillList('importers-list',dependents);
    svg.replaceChildren();
    const shownLeft=dependencies.slice(0,12),shownRight=dependents.slice(0,12);
    const count=Math.max(shownLeft.length,shownRight.length,1),height=Math.max(240,count*56+70);
    svg.setAttribute('viewBox',`0 0 1000 ${height}`);
    const middle=height/2;
    function node(file,x,y,kind){
      const entry=manifest[file],displayPath=leanPath(entry[0]),group=element('g',{class:'module-node '+kind,tabindex:0,role:'button','aria-label':displayPath});
      const rect=element('rect',{x:x-135,y:y-20,width:270,height:40,rx:6});
      const label=element('text',{x,y:y+4,'text-anchor':'middle'});const name=displayPath.split('/').at(-1);label.textContent=name.length>31?name.slice(0,25)+'….lean':name;
      const title=element('title');title.textContent=displayPath;group.append(rect,label,title);group.onclick=()=>navigateDependencies(entry[0]);group.onkeydown=event=>{if(event.key==='Enter')group.onclick();};svg.append(group);
    }
    const center=500;
    for(const [items,x,kind] of [[shownLeft,155,'imports'],[shownRight,845,'importers']]){
      items.forEach((file,i)=>{const y=(height-(items.length-1)*56)/2+i*56;const x1=kind==='imports'?center-135:x-135,x2=kind==='imports'?x+135:center+135;const y1=kind==='imports'?middle:y,y2=kind==='imports'?y:middle;
        svg.append(element('path',{d:`M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`,class:'module-edge'}));node(file,x,y,kind);});
    }
    node(id,500,middle,'selected');
    document.getElementById('dependency-graph-note').textContent=`Left: imported modules. Right: modules that import this file. The web shows up to 12 neighbors on each side; the lists below include every direct connection. Click a node to explore it. External mathlib / Lean imports are excluded from this project graph.`;
    function fillList(target,ids){const container=document.getElementById(target);container.replaceChildren();if(!ids.length){const empty=document.createElement('p');empty.textContent='No direct project connections.';container.append(empty);return;}for(const file of ids){const button=document.createElement('button');button.textContent=leanPath(manifest[file][0]);button.onclick=()=>navigateDependencies(manifest[file][0]);container.append(button);}}
  }
  return {show};
}

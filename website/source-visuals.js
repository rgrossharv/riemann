import {leanPath} from './archive-paths.js';

const NS='http://www.w3.org/2000/svg';
const svg=(tag,attrs={})=>{const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
const number=value=>Number(value).toLocaleString('en-US');
const palette=['#80d8bb','#8ebbe8','#b7a3e7','#e2b77e','#76b9c5','#c0cc81','#d88d9c','#a6b4c4','#dfc4b6','#82a69e'];
export function sourceColors(summary){const groups=[...new Set(summary.layers.flatMap(layer=>Object.keys(layer.groups)))];return new Map(groups.map((name,i)=>[name,palette[i%palette.length]]));}

function fitChart(chart, draw) {
  let width = chart.clientWidth || 1000;
  let height = chart.clientHeight || 460;

  function render() {
    chart.replaceChildren();
    chart.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    draw(width, height);
  }

  new ResizeObserver(() => {
    const nextWidth = chart.clientWidth;
    const nextHeight = chart.clientHeight;
    if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
    width = nextWidth;
    height = nextHeight;
    render();
  }).observe(chart);
  return render;
}

export function renderLayerProfile(summary, selectLayer) {
  const chart = document.getElementById('layer-profile');
  const layers = summary.layers;
  const max = Math.max(...layers.map(layer => layer.lines));
  const lastDepth = layers.at(-1).depth;
  const colors = sourceColors(summary);
  let selectedDepth;

  const render = fitChart(chart, (chartWidth, chartHeight) => {
    const compact = chartWidth < 540;
    const left = compact ? 44 : 60;
    const top = 16;
    const width = Math.max(1, chartWidth - left - 14);
    const height = Math.max(1, chartHeight - top - 50);
    const bottom = top + height;
    const tickInterval = compact ? 10 : 4;
    for (let i = 0; i <= 4; i++) {
      const y = bottom - height * i / 4;
      chart.append(svg('line', {x1: left, y1: y, x2: left + width, y2: y, class: 'profile-grid'}));
      const label = svg('text', {x: left - 8, y: y + 4, 'text-anchor': 'end', class: 'profile-axis'});
      label.textContent = i === 0 ? '0' : (max * i / 4 / 1e6).toFixed(2) + 'm';
      chart.append(label);
    }

    const step = width / layers.length;
    const gap = Math.min(2, step / 4);
    for (const layer of layers) {
      const x = left + layer.depth * step;
      const group = svg('g', {class: 'profile-layer', 'data-depth': layer.depth, tabindex: 0, role: 'button'});
      const title = svg('title');
      title.textContent = 'Layer ' + layer.depth + ' · ' + number(layer.lines) + ' lines · ' + number(layer.files) + ' files';
      group.setAttribute('aria-label', title.textContent);
      markLayer(group);
      let used = 0;
      for (const [name, lines] of Object.entries(layer.groups)) {
        const barHeight = height * lines / max;
        used += barHeight;
        group.append(svg('rect', {x: x + gap / 2, y: bottom - used, width: step - gap, height: barHeight,
          fill: colors.get(name), class: 'profile-data', 'data-lines': lines}));
      }
      group.append(svg('rect', {x, y: top, width: step, height, fill: 'transparent', class: 'profile-hit'}), title);
      group.onclick = () => selectLayer(layer);
      group.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectLayer(layer);
        }
      };
      group.onmouseenter = () => { document.getElementById('profile-hover').textContent = title.textContent; };
      chart.append(group);
      if (layer.depth === lastDepth || (layer.depth % tickInterval === 0 && lastDepth - layer.depth >= tickInterval / 2)) {
        const label = svg('text', {x: x + step / 2, y: bottom + 20, 'text-anchor': 'middle', class: 'profile-axis'});
        label.textContent = layer.depth;
        chart.append(label);
      }
    }
    const label = svg('text', {x: left + width / 2, y: bottom + 40, 'text-anchor': 'middle', class: 'profile-axis'});
    label.textContent = 'Dependency layer';
    chart.append(label);
  });

  function markLayer(node) {
    const selected = Number(node.dataset.depth) === selectedDepth;
    node.classList.toggle('selected', selected);
    node.setAttribute('aria-pressed', String(selected));
  }

  render();
  return {
    select(depth) {
      selectedDepth = depth;
      chart.querySelectorAll('.profile-layer').forEach(markLayer);
    },
  };
}

function layout(items,x,y,width,height){
  if(!items.length)return [];
  if(items.length===1)return [{...items[0],x,y,width,height}];
  const total=items.reduce((sum,item)=>sum+item.lines,0);let sum=0,cut=1,best=Infinity;
  for(let i=1;i<items.length;i++){sum+=items[i-1].lines;const distance=Math.abs(sum-total/2);if(distance<best){best=distance;cut=i;}}
  const first=items.slice(0,cut),second=items.slice(cut),fraction=first.reduce((sum,item)=>sum+item.lines,0)/total;
  if(width>=height){const size=width*fraction;return [...layout(first,x,y,size,height),...layout(second,x+size,y,width-size,height)];}
  const size=height*fraction;return [...layout(first,x,y,width,size),...layout(second,x,y+size,width,height-size)];
}

export function createSourceTreemap(manifest,summary,openFile){
  const chart=document.getElementById('source-treemap'),colors=sourceColors(summary);
  let prefix='';
  let items = [], total = 0;
  const render = fitChart(chart, (width, height) => {
    for (const item of layout(items, 0, 0, width, height)) {
      const node=svg('g',{class:'treemap-node',role:'button',tabindex:0,'aria-label':`${item.displayPath}, ${number(item.lines)} lines. ${item.directory?'Open folder':'Read file'}`});
      const group=item.path.split('/')[0],fill=prefix?palette[item.colorIndex%palette.length]:colors.get(group)||colors.get('Entry points');
      const rect=svg('rect',{x:item.x,y:item.y,width:item.width,height:item.height,fill,class:'treemap-data','data-lines':item.lines,'data-path':item.path});
      node.append(rect);
      if(item.width>68&&item.height>30){
        const max = Math.floor((item.width - 18) / 8);
        const ending = item.directory ? '…' : '….lean';
        const name = item.displayName.length > max ? item.displayName.slice(0, max - ending.length) + ending : item.displayName;
        const label=svg('text',{x:item.x+9,y:item.y+20,class:'treemap-label'});label.textContent=name;node.append(label);
        const countText=number(item.lines)+' lines';
        if(item.height>49&&countText.length*7<=item.width-18){const count=svg('text',{x:item.x+9,y:item.y+38,class:'treemap-count'});count.textContent=countText;node.append(count);}
        const shareText=(100*item.lines/total).toFixed(2)+'% · '+number(item.files)+' files';
        if(item.height>69&&shareText.length*7<=item.width-18){const share=svg('text',{x:item.x+9,y:item.y+57,class:'treemap-count'});share.textContent=shareText;node.append(share);}
      }
      const title=svg('title');title.textContent=`${item.displayPath} · ${number(item.lines)} lines · ${number(item.files)} files · ${(100*item.lines/total).toFixed(3)}% of this view`;node.append(title);
      node.onmouseenter=()=>inspect(item,total);node.onfocus=()=>inspect(item,total);node.onclick=()=>item.directory?show(item.path):openFile(item.path);node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();node.onclick();}};chart.append(node);
    }
  });
  function show(next=''){
    prefix=next;const children=new Map();
    for(const entry of manifest){
      if(prefix&&!entry[0].startsWith(prefix+'/'))continue;
      const rest=prefix?entry[0].slice(prefix.length+1):entry[0],parts=rest.split('/'),name=parts[0],path=prefix?prefix+'/'+name:name;
      let item=children.get(name);if(!item){item={name,path,directory:parts.length>1,lines:0,files:0};children.set(name,item);}item.lines+=entry[1];item.files++;
    }
    items = [...children.values()].filter(item => item.lines > 0)
      .sort((a, b) => b.lines - a.lines)
      .map((item, colorIndex) => ({
        ...item, colorIndex,
        displayName: item.directory ? item.name : leanPath(item.name),
        displayPath: item.directory ? item.path : leanPath(item.path),
      }));
    total = items.reduce((sum, item) => sum + item.lines, 0);
    render();
    document.getElementById('treemap-location').textContent='text/'+(prefix?prefix+'/':'');
    document.getElementById('treemap-total').textContent=number(total)+' source lines · '+number(items.reduce((sum,item)=>sum+item.files,0))+' files in this view';
    document.getElementById('treemap-up').disabled=!prefix;
    const list=document.getElementById('treemap-folders');list.replaceChildren();
    for(const item of items){const button=document.createElement('button');button.textContent=`${item.displayName} · ${number(item.lines)} lines`;button.onclick=()=>item.directory?show(item.path):openFile(item.path);list.append(button);}
    inspect(items[0],total);
  }
  function inspect(item,total){if(!item)return;document.getElementById('treemap-inspect').textContent=`${item.displayPath} · ${number(item.lines)} lines · ${number(item.files)} files · ${(100*item.lines/total).toFixed(3)}%`;
  }
  document.getElementById('treemap-up').onclick=()=>show(prefix.includes('/')?prefix.slice(0,prefix.lastIndexOf('/')):'');
  document.getElementById('treemap-reset').onclick=()=>show('');show();
  return {show};
}

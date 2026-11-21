const NS='http://www.w3.org/2000/svg';
const svg=(tag,attrs={})=>{const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
const number=value=>Number(value).toLocaleString('en-US');
const palette=['#80d8bb','#8ebbe8','#b7a3e7','#e2b77e','#76b9c5','#c0cc81','#d88d9c','#a6b4c4','#dfc4b6','#82a69e'];
export function sourceColors(summary){const groups=[...new Set(summary.layers.flatMap(layer=>Object.keys(layer.groups)))];return new Map(groups.map((name,i)=>[name,palette[i%palette.length]]));}

export function renderLayerProfile(summary,selectLayer){
  const chart=document.getElementById('layer-profile');
  const layers=summary.layers,max=Math.max(...layers.map(layer=>layer.lines)),colors=sourceColors(summary);
  const left=84,top=30,width=896,height=300,bottom=top+height;
  chart.setAttribute('viewBox','0 0 1000 390');
  for(let i=0;i<=4;i++){
    const y=bottom-height*i/4;
    chart.append(svg('line',{x1:left,y1:y,x2:left+width,y2:y,class:'profile-grid'}));
    const label=svg('text',{x:left-12,y:y+5,'text-anchor':'end',class:'profile-axis'});label.textContent=i===0?'0':(max*i/4/1e6).toFixed(2)+'m';chart.append(label);
  }
  const step=width/layers.length;
  for(const layer of layers){
    const x=left+layer.depth*step;
    const group=svg('g',{class:'profile-layer','data-depth':layer.depth,tabindex:0,role:'button','aria-label':`Layer ${layer.depth}: ${number(layer.lines)} lines in ${number(layer.files)} files`});
    let used=0;
    for(const [name,lines]of Object.entries(layer.groups)){
      const h=height*lines/max;
      group.append(svg('rect',{x:x+1,y:bottom-height*(used+lines)/max,width:step-2,height:h,fill:colors.get(name),class:'profile-data','data-lines':lines}));used+=lines;
    }
    const hit=svg('rect',{x,y:top,width:step,height,fill:'transparent',class:'profile-hit'});group.append(hit);
    const title=svg('title');title.textContent=`Layer ${layer.depth} · ${number(layer.lines)} lines · ${number(layer.files)} files`;group.append(title);
    group.onclick=()=>selectLayer(layer);group.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectLayer(layer);}};
    group.onmouseenter=()=>{document.getElementById('profile-hover').textContent=title.textContent;};chart.append(group);
    if(layer.depth%4===0||layer.depth===layers.length-1){const label=svg('text',{x:x+step/2,y:bottom+25,'text-anchor':'middle',class:'profile-axis'});label.textContent=layer.depth;chart.append(label);}
  }
  const label=svg('text',{x:left+width/2,y:bottom+52,'text-anchor':'middle',class:'profile-axis'});label.textContent='Dependency layer · shortest import distance from Main';chart.append(label);
  return {select(depth){chart.querySelectorAll('.profile-layer').forEach(node=>node.classList.toggle('selected',Number(node.dataset.depth)===depth));}};
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
  function show(next=''){
    prefix=next;const children=new Map();
    for(const entry of manifest){
      if(prefix&&!entry[0].startsWith(prefix+'/'))continue;
      const rest=prefix?entry[0].slice(prefix.length+1):entry[0],parts=rest.split('/'),name=parts[0],path=prefix?prefix+'/'+name:name;
      let item=children.get(name);if(!item){item={name,path,directory:parts.length>1,lines:0,files:0};children.set(name,item);}item.lines+=entry[1];item.files++;
    }
    const items=[...children.values()].filter(item=>item.lines>0).sort((a,b)=>b.lines-a.lines),total=items.reduce((sum,item)=>sum+item.lines,0);
    chart.replaceChildren();chart.setAttribute('viewBox','0 0 1000 460');
    for(const item of layout(items.map((item,index)=>({...item,colorIndex:index})),0,0,1000,460)){
      const node=svg('g',{class:'treemap-node',role:'button',tabindex:0,'aria-label':`${item.path}, ${number(item.lines)} lines. ${item.directory?'Open folder':'Read file'}`});
      const group=item.path.split('/')[0],fill=prefix?palette[item.colorIndex%palette.length]:colors.get(group)||colors.get('Entry points');
      const rect=svg('rect',{x:item.x,y:item.y,width:item.width,height:item.height,fill,class:'treemap-data','data-lines':item.lines,'data-path':item.path});
      node.append(rect);
      if(item.width>95&&item.height>46){
        const max=Math.max(4,Math.floor((item.width-26)/11)),name=item.name.length>max?item.name.slice(0,max-1)+'…':item.name;
        const label=svg('text',{x:item.x+13,y:item.y+28,class:'treemap-label'});label.textContent=name;node.append(label);
        const countText=number(item.lines)+' lines';
        if(item.height>75&&countText.length*8<=item.width-26){const count=svg('text',{x:item.x+13,y:item.y+53,class:'treemap-count'});count.textContent=countText;node.append(count);}
        const shareText=(100*item.lines/total).toFixed(2)+'% · '+number(item.files)+' files';
        if(item.height>108&&shareText.length*8<=item.width-26){const share=svg('text',{x:item.x+13,y:item.y+77,class:'treemap-count'});share.textContent=shareText;node.append(share);}
      }
      const title=svg('title');title.textContent=`${item.path} · ${number(item.lines)} lines · ${number(item.files)} files · ${(100*item.lines/total).toFixed(3)}% of this view`;node.append(title);
      node.onmouseenter=()=>inspect(item,total);node.onfocus=()=>inspect(item,total);node.onclick=()=>item.directory?show(item.path):openFile(item.path);node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();node.onclick();}};chart.append(node);
    }
    document.getElementById('treemap-location').textContent='text/'+(prefix?prefix+'/':'');
    document.getElementById('treemap-total').textContent=number(total)+' source lines · '+number(items.reduce((sum,item)=>sum+item.files,0))+' files in this view';
    document.getElementById('treemap-up').disabled=!prefix;
    const list=document.getElementById('treemap-folders');list.replaceChildren();
    for(const item of items){const button=document.createElement('button');button.textContent=`${item.name} · ${number(item.lines)} lines`;button.onclick=()=>item.directory?show(item.path):openFile(item.path);list.append(button);}
    inspect(items[0],total);
  }
  function inspect(item,total){if(!item)return;document.getElementById('treemap-inspect').textContent=`${item.path} · ${number(item.lines)} lines · ${number(item.files)} files · ${(100*item.lines/total).toFixed(3)}%`;
  }
  document.getElementById('treemap-up').onclick=()=>show(prefix.includes('/')?prefix.slice(0,prefix.lastIndexOf('/')):'');
  document.getElementById('treemap-reset').onclick=()=>show('');show();
  return {show};
}

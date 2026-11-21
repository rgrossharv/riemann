import {renderLayerProfile} from './source-visuals.js';
const svgNS = 'http://www.w3.org/2000/svg';
const element = (tag, attrs = {}) => {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
};
const number = value => Number(value).toLocaleString('en-US');
const base = 'Development/AutomorphicArithmetic/';
const stages = [
  {id:'row', title:'Theta lifts and Galois compatibility', label:'Row0b', row:1, column:'1',
    file:base+'Foundations/GaloisRepresentations/IntegralStructures/RowSrc.txt', line:6,
    theorem:'galoisLocalGlobalStrong_recParameter',
    explanation:'This step supplies the local-global compatibility statement called Row0b. Its proof applies galoisRepresentations_of_thetaLift to the claimed theta-lift construction tLiftK.',
    connection:'The final assembly uses this statement both to supply upstream hypotheses and to construct the automorphic window. The substantial geometry and theta-lift arguments are inside its imports.'},
  {id:'local', title:'Local Langlands reconstruction', label:'RecTExists', row:1, column:'2',
    file:base+'Foundations/LocalLanglands/LocalCentralUnits/RecTExists.txt', line:20,
    theorem:'UpperTheory.Zero.LLC.recTExists',
    explanation:'This declaration constructs the local correspondence data represented by RecTExists. Its body assembles dimension, character, twisting, duality, injectivity, depth, and type properties.',
    connection:'everyCharacter_of_row passes this theorem into the package of upstream statements used in the final nonvanishing argument.'},
  {id:'bounds', title:'Geometric covolume bound', label:'CovolumeBoundOfX', row:1, column:'3',
    file:base+'ThetaCorrespondence/ThetaPairLifts/ThirdPlaceSeries/TopCovolSlim2Use.txt', line:16,
    theorem:'SelfIntersectionVolumeEstimates.topCovolSlim2_use_alt_alt',
    explanation:'This bridge produces the covolume bound required by the theta-integral argument from a long list of geometric and arithmetic statements, including resolution, principalisation, height bounds, and deformation results.',
    connection:'The assembly theorem explicitly passes this bound to every_character_of_theta_integrals_local_matching. Select its source to inspect the full hypotheses rather than treating the collapsed box as one elementary step.'},
  {id:'window', title:'Construct the automorphic window', label:'VWin', row:2, column:'1',
    file:base+'AutomorphicVarieties/ModularityArgument/ThresholdArguments/DenseThresholdCases/VwinOfRow.txt', line:4,
    theorem:'UpperTheory.One.vwin_of_row',
    explanation:'The submitted argument turns Row0b into VWin using automorphic_window_of_inputs, an open-image package, and the base-change theorem baseChangeN.',
    connection:'VWin is a quantified bound over character fields and arithmetic windows. Its exact definition is in CharacterBoxes/ExistsPageN.txt; this guide retains the code’s name rather than replacing it with a stronger informal claim.'},
  {id:'literature', title:'Assemble the upstream statements', label:'OpenLiteratureStatements', row:2, column:'2 / 4',
    file:base+'CharacterBoxes/MainConclusion.txt', line:7,
    theorem:'UpperTheory.FinalTheorems.everyCharacter_of_row',
    explanation:'The final assembly forms the upstream package with the expression ⟨h, recTExists, h⟩, where h is the Row0b statement. It supplies that package and vwin_of_row h to the literature-to-nonvanishing theorem.',
    connection:'The word “literature” is the submitted code’s name for this interface. Its status still depends on the implementations and imported proofs; the name alone is not a verification result.'},
  {id:'assembly', title:'Combine theta integrals, local matching, and bounds', label:'The central assembly', row:3, column:'1 / 4',
    file:base+'ThetaCorrespondence/ThetaPairLifts/ThirdPlaceSeries/EveryCharacterOfLiteratureOfVWin.txt', line:810,
    theorem:'UpperTheory.LiteratureTheorems.every_character_of_literature_of_vWin',
    explanation:'This theorem gathers the published-results interfaces, agreement of theta integrals, local matching, the geometric covolume bound, RecTExists, and VWin. It applies every_character_of_theta_integrals_local_matching to obtain EveryCharacter.',
    connection:'The lower-level assembly is in SiegelEisensteinSecondTermHypotheses.txt, line 69. That step constructs its analytic hypotheses and calls every_character_of_green_v_win. The large internal subarguments are collapsed in this reading guide.'},
  {id:'nonvanishing', title:'No Dirichlet L-function zeros to the right of ½', label:'EveryCharacter', row:4, column:'1 / 4',
    file:base+'CharacterBoxes/MainConclusion.txt', line:10,
    theorem:'UpperTheory.FinalTheorems.everyCharacter',
    explanation:'This is the main nonvanishing claim: for every nonzero modulus N, every complex Dirichlet character χ, and every s with Re(s) > ½, L(χ,s) ≠ 0 whenever χ ≠ 1 or s ≠ 1.',
    connection:'The exact proposition is defined in CharacterBoxes/EveryCharacter.txt. MainConclusion supplies Row0b to everyCharacter_of_row, and Supplements/Kernels/MainTheorems.txt names the result allChi.'},
  {id:'reflection', title:'Specialize to zeta and reflect zeros', label:'RH from a zero-free half-plane', row:5, column:'1 / 3',
    file:'Formalism/GammaFactorNonvanishing/CritLine.txt', line:30,
    theorem:'Formalism.VW.rh_of_every',
    explanation:'The modulus-one character specializes Dirichlet L-function nonvanishing to zeta. rh_of_right then uses zeta’s functional equation: a nontrivial zero left of ½ would yield a zero right of ½. Zeros right of ½ are already excluded, leaving only the critical line.',
    connection:'The case split, gamma-factor checks, and treatment of negative even integers appear explicitly in Formalism/GammaFactorNonvanishing/RhOfRight.txt.'},
  {id:'dirichlet', title:'Reflect primitive-character zeros', label:'Dirichlet critical-line conclusions', row:5, column:'3',
    file:'Formalism/GammaFactorNonvanishing/CritLine.txt', line:11,
    theorem:'Formalism.VW.critLine',
    explanation:'For a primitive Dirichlet character, the completed L-function’s functional equation reflects a zero at s to one at 1 − s for the inverse character. Nonzero gamma factors allow this to be compared with the same zero-free half-plane.',
    connection:'ClaimStrip.txt extends the strip statement to imprimitive characters by passing to the primitive character and checking that the removed Euler factors do not vanish in the strip.'},
  {id:'main', title:'Export RH and the Dirichlet L-function statements', label:'Main.txt', row:6, column:'1 / 4',
    file:'Main.txt', line:4,
    theorem:'riemannHypothesis : RiemannHypothesis',
    explanation:'The final file exports five declarations: RH, a zeta-zero formulation, nonvanishing to the right of ½ for Dirichlet L-functions, and two critical-strip zero statements.',
    connection:'This map follows the final assembly in the submitted sources. Every box can be opened as plain text. The separate compilation report determines whether this machine has verified the complete imported argument.'}
];
const links = [['row','window'],['row','literature'],['local','literature'],['bounds','assembly'],['window','assembly'],['literature','assembly'],['assembly','nonvanishing'],['nonvanishing','reflection'],['nonvanishing','dirichlet'],['reflection','main'],['dirichlet','main']];

export function initializeProofGuide(openFile) {
  const canvas=document.getElementById('proof-stage-canvas');
  canvas.innerHTML='';
  const controls=document.createElement('div');controls.className='atlas-controls';
  const svg=element('svg',{id:'proof-graph',viewBox:'0 0 1050 570',role:'img','aria-label':'Interactive map of the submitted proof. Select a step, or drag to pan.'});
  const positions={row:[20,20],local:[20,160],bounds:[20,300],window:[280,20],literature:[280,160],assembly:[540,160],nonvanishing:[800,160],reflection:[540,300],dirichlet:[800,300],main:[800,440]};
  const labels={row:['Theta lifts','Galois compatibility'],local:['Local Langlands','reconstruction'],bounds:['Geometric','covolume bound'],window:['Automorphic','window'],literature:['Upstream','input package'],assembly:['Theta integrals','and local matching'],nonvanishing:['Zero-free half-plane','Re(s) > ½'],reflection:['Zeta functional','equation'],dirichlet:['Dirichlet','reflection'],main:['Riemann hypothesis','+ Dirichlet statements']};
  let view={x:0,y:0,w:1050,h:570},selected='nonvanishing',drag,dragged=false;
  const defs=element('defs');const marker=element('marker',{id:'proof-tip',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});marker.append(element('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'currentColor'}));defs.append(marker);svg.append(defs);
  const paths=element('g'),nodes=element('g');svg.append(paths,nodes);
  const routes={
    'row:window':'M 250 64 H 280', 'row:literature':'M 250 64 H 265 V 204 H 280',
    'local:literature':'M 250 204 H 280', 'bounds:assembly':'M 250 344 H 525 V 204 H 540',
    'window:assembly':'M 510 64 H 525 V 204 H 540', 'literature:assembly':'M 510 204 H 540',
    'assembly:nonvanishing':'M 770 204 H 800','nonvanishing:reflection':'M 915 248 V 274 H 655 V 300',
    'nonvanishing:dirichlet':'M 915 248 V 300','reflection:main':'M 655 388 V 414 H 915 V 440','dirichlet:main':'M 915 388 V 440'
  };
  for(const [from,to] of links){const path=element('path',{d:routes[from+':'+to],class:'atlas-edge','data-from':from,'data-to':to,'marker-end':'url(#proof-tip)'});const title=element('title');title.textContent=stages.find(s=>s.id===from).title+' supplies '+stages.find(s=>s.id===to).title;path.append(title);paths.append(path);}
  for(const stage of stages){
    const [x,y]=positions[stage.id];const node=element('g',{class:'proof-stage atlas-node','data-stage':stage.id,tabindex:0,role:'button','aria-label':stage.title,transform:`translate(${x} ${y})`});
    const rect=element('rect',{x:0,y:0,width:230,height:88,rx:9});
    const label=element('text',{x:16,y:32});
    labels[stage.id].forEach((line,i)=>{const span=element('tspan',{x:16,dy:i?27:0});span.textContent=line;label.append(span);});
    const title=element('title');title.textContent=stage.title+' — '+stage.file+':'+stage.line;node.append(rect,label,title);
    node.onclick=()=>{if(!dragged)select(stage.id);};node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(stage.id);}};nodes.append(node);
  }
  function button(text,action){const button=document.createElement('button');button.textContent=text;button.onclick=action;controls.append(button);return button;}
  const previous=button('Previous step',()=>move(-1)),next=button('Next step',()=>move(1));
  const spacer=document.createElement('span');spacer.className='atlas-control-spacer';controls.append(spacer);
  button('Zoom in',()=>zoom(.8));button('Zoom out',()=>zoom(1.25));button('Fit',()=>{view={x:0,y:0,w:1050,h:570};draw();});
  const scale=document.createElement('span');scale.className='atlas-scale';controls.append(scale);canvas.append(controls,svg);
  function draw(){svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);scale.textContent=Math.round(1050/view.w*100)+'%';}
  function zoom(factor){const w=Math.min(2100,Math.max(420,view.w*factor)),h=w*570/1050;view={x:view.x+(view.w-w)/2,y:view.y+(view.h-h)/2,w,h};draw();}
  function move(direction){const index=stages.findIndex(stage=>stage.id===selected);select(stages[Math.max(0,Math.min(stages.length-1,index+direction))].id);}
  function select(id){
    selected=id;const stage=stages.find(stage=>stage.id===id);const index=stages.indexOf(stage);
    nodes.querySelectorAll('.atlas-node').forEach(node=>{const active=node.dataset.stage===id;node.classList.toggle('selected',active);node.setAttribute('aria-pressed',active);});
    paths.querySelectorAll('.atlas-edge').forEach(path=>path.classList.toggle('selected',path.dataset.from===id||path.dataset.to===id));
    document.getElementById('proof-detail-title').textContent=stage.title;
    document.getElementById('proof-detail-explanation').textContent=stage.explanation;
    document.getElementById('proof-detail-connection').textContent=stage.connection;
    document.getElementById('proof-detail-theorem').textContent=stage.theorem;
    document.getElementById('proof-detail-file').textContent=`${stage.file} · line ${stage.line}`;
    document.getElementById('proof-open-source').onclick=()=>openFile(stage.file,stage.line);
    previous.disabled=index===0;next.disabled=index===stages.length-1;
    const [x,y]=positions[id];if(x<view.x||y<view.y||x+230>view.x+view.w||y+88>view.y+view.h){view.x=x+115-view.w/2;view.y=y+44-view.h/2;draw();}
  }
  svg.addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();zoom(event.deltaY>0?1.12:.89);},{passive:false});
  svg.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,view:{...view}};dragged=false;});
  svg.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!dragged&&Math.abs(dx)+Math.abs(dy)>4){dragged=true;svg.setPointerCapture(event.pointerId);}if(dragged){const bounds=svg.getBoundingClientRect();view.x=drag.view.x-dx/bounds.width*view.w;view.y=drag.view.y-dy/bounds.height*view.h;draw();}});
  svg.addEventListener('pointerup',()=>{drag=null;setTimeout(()=>dragged=false,0);});
  draw();select(selected);return {redraw:draw};
}

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
    for(const [path,lines] of layer.largest_files){const button=document.createElement('button');button.textContent=`${path} · ${number(lines)} lines`;button.onclick=()=>openFile(path);files.append(button);}
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
    const q=input.value.toLowerCase().replace(/\.lean$/,'.txt');
    searchResults.replaceChildren();
    if(!q)return;
    const matches=manifest.filter(entry=>entry[0].toLowerCase().includes(q)).slice(0,8);
    for(const entry of matches){const button=document.createElement('button');button.textContent=entry[0];button.onclick=()=>{input.value=entry[0];searchResults.replaceChildren();navigateDependencies(entry[0]);};searchResults.append(button);}
  };
  document.getElementById('dependency-form').onsubmit=event=>{event.preventDefault();const path=input.value.trim().replace(/\.lean$/,'.txt');if(lookup.has(path)){searchResults.replaceChildren();navigateDependencies(path);}else input.dispatchEvent(new Event('input'));};
  async function show(path='Main.txt') {
    const token=selectedEntry=path;
    const id=lookup.get(path);
    if(id===undefined)throw new Error('Unknown file in dependency explorer.');
    input.value=path;searchResults.replaceChildren();
    document.getElementById('dependency-selected').textContent=path;
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
      const entry=manifest[file],group=element('g',{class:'module-node '+kind,tabindex:0,role:'button','aria-label':entry[0]});
      const rect=element('rect',{x:x-135,y:y-20,width:270,height:40,rx:6});
      const label=element('text',{x,y:y+4,'text-anchor':'middle'});const name=entry[0].split('/').at(-1);label.textContent=name.length>31?name.slice(0,28)+'…':name;
      const title=element('title');title.textContent=entry[0];group.append(rect,label,title);group.onclick=()=>navigateDependencies(entry[0]);group.onkeydown=event=>{if(event.key==='Enter')group.onclick();};svg.append(group);
    }
    const center=500;
    for(const [items,x,kind] of [[shownLeft,155,'imports'],[shownRight,845,'importers']]){
      items.forEach((file,i)=>{const y=(height-(items.length-1)*56)/2+i*56;const x1=kind==='imports'?center-135:x-135,x2=kind==='imports'?x+135:center+135;const y1=kind==='imports'?middle:y,y2=kind==='imports'?y:middle;
        svg.append(element('path',{d:`M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`,class:'module-edge'}));node(file,x,y,kind);});
    }
    node(id,500,middle,'selected');
    document.getElementById('dependency-graph-note').textContent=`Left: imported modules. Right: modules that import this file. The web shows up to 12 neighbors on each side; the lists below include every direct connection. Click a node to explore it. External mathlib / Lean imports are excluded from this project graph.`;
    function fillList(target,ids){const container=document.getElementById(target);container.replaceChildren();if(!ids.length){const empty=document.createElement('p');empty.textContent='No direct project connections.';container.append(empty);return;}for(const file of ids){const button=document.createElement('button');button.textContent=manifest[file][0];button.onclick=()=>navigateDependencies(manifest[file][0]);container.append(button);}}
  }
  return {show};
}

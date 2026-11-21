export function createRepositoryExplorer(manifest, openFile) {
  const root={name:'text',path:'',directory:true,children:new Map(),count:0};
  for(const entry of manifest){
    const parts=entry[0].split('/');let parent=root;parent.count++;
    for(let i=0;i<parts.length;i++){
      const name=parts[i],directory=i<parts.length-1;
      let child=parent.children.get(name);
      if(!child){child={name,path:parts.slice(0,i+1).join('/'),directory,children:directory?new Map():null,count:0,parent};parent.children.set(name,child);}
      if(directory)child.count++;
      parent=child;
    }
  }
  const tree=document.getElementById('repo-tree');
  function children(parent,container,depth){
    const entries=[...parent.children.values()].sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
    let shown=0,more;
    function append(){
      more?.remove();
      for(const node of entries.slice(shown,shown+400))container.append(item(node,depth));
      shown+=400;
      if(shown<entries.length){more=document.createElement('button');more.className='tree-more';more.textContent=`Show more (${entries.length-shown} remaining)`;more.onclick=append;container.append(more);}
    }
    parent.showAll=()=>{while(shown<entries.length)append();};
    append();
  }
  function item(node,depth){
    const wrapper=document.createElement('div');wrapper.className='tree-entry';
    const button=document.createElement('button');button.className='tree-item '+(node.directory?'tree-folder':'tree-file');button.setAttribute('role','treeitem');button.setAttribute('aria-level',depth+1);button.title=node.path;button.style.paddingLeft=(8+depth*13)+'px';button.dataset.path=node.path;
    const icon=document.createElement('span');icon.className=node.directory?'folder-icon':'file-icon';icon.textContent=node.directory?'›':'λ';icon.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.className='tree-name';label.textContent=node.name;
    button.append(icon,label);
    node.button=button;wrapper.append(button);
    if(node.directory){
      const group=document.createElement('div');group.setAttribute('role','group');group.hidden=true;wrapper.append(group);button.setAttribute('aria-expanded','false');
      const count=document.createElement('small');count.textContent=node.count.toLocaleString('en-US');button.append(count);
      node.expand=()=>{if(!node.rendered){children(node,group,depth+1);node.rendered=true;}group.hidden=false;button.setAttribute('aria-expanded','true');};
      node.collapse=()=>{group.hidden=true;button.setAttribute('aria-expanded','false');};
      button.onclick=()=>group.hidden?node.expand():node.collapse();
    }else button.onclick=()=>openFile(node.path);
    button.onkeydown=event=>{
      if(event.key==='ArrowRight'&&node.directory){event.preventDefault();node.expand();}
      else if(event.key==='ArrowLeft'){event.preventDefault();if(node.directory&&button.getAttribute('aria-expanded')==='true')node.collapse();else node.parent?.button?.focus();}
      else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const visible=[...tree.querySelectorAll('.tree-item')].filter(item=>item.offsetParent!==null);const i=visible.indexOf(button);visible[Math.max(0,Math.min(visible.length-1,i+(event.key==='ArrowDown'?1:-1)))]?.focus();}
    };
    return wrapper;
  }
  children(root,tree,0);
  return {
    reveal(path){
      let node=root;
      for(const part of path.split('/')){
        node.showAll?.();
        node=node.children?.get(part);
        if(!node)return;
        if(node.directory)node.expand();
      }
      const previous = tree.querySelector('.tree-item.selected');
      previous?.classList.remove('selected');
      previous?.removeAttribute('aria-selected');
      if (node.button) {
        node.button.classList.add('selected');
        node.button.setAttribute('aria-selected', 'true');
        const row = node.button.getBoundingClientRect();
        const viewport = tree.getBoundingClientRect();
        if (row.top < viewport.top) tree.scrollTop += row.top - viewport.top;
        else if (row.bottom > viewport.bottom) tree.scrollTop += row.bottom - viewport.bottom;
      }
    }
  };
}

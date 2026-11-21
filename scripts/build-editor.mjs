import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const output=path.join(root,'website/assets');
await fs.mkdir(output,{recursive:true});
await build({entryPoints:['editor-src/lean-editor.js'],outfile:path.join(output,'lean-editor.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,
  loader:{'.wasm':'file','.ttf':'file'},assetNames:'[name]-[hash]',external:['fs','path'],logLevel:'info'});
await build({entryPoints:['node_modules/monaco-editor/esm/vs/editor/editor.worker.js'],outfile:path.join(output,'editor-worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'info'});
const notices=[];
for(const name of ['monaco-editor','vscode-textmate','vscode-oniguruma']){
  for(const license of ['LICENSE','LICENSE.txt','LICENSE.md','ThirdPartyNotices.txt','NOTICES.txt']){
    try{notices.push(name+' / '+license+'\n'+await fs.readFile(path.join(root,'node_modules',name,license),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
}
await fs.writeFile(path.join(output,'THIRD-PARTY-LICENSES.txt'),notices.join('\n\n'));
await fs.cp(path.join(root,'website'),path.join(root,'dist'),{recursive:true});

import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands.js';
import 'monaco-editor/editor/contrib/links/browser/links.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
import * as textmate from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';
import wasmURL from 'vscode-oniguruma/release/onig.wasm';
import grammarSource from '../website/vendor/lean4.json';
import markdownSource from '../website/vendor/lean4-markdown.json';

let initializePromise;
const themes = {
  dark: {base:'vs-dark', colors:{'editor.background':'#10181b','editor.foreground':'#d4d4d4','editorLineNumber.foreground':'#657d87','editorLineNumber.activeForeground':'#b5ccd6','editor.selectionBackground':'#264f78','editor.lineHighlightBackground':'#172228','editorGutter.background':'#10181b','editorWidget.background':'#151e22','editorWidget.border':'#2a393f'},
    rules:[['keyword','569CD6'],['storage.modifier','569CD6'],['storage.type','4EC9B0'],['entity.name.function','DCDCAA'],['entity.name','9CDCFE'],['comment','6A9955'],['string','CE9178'],['constant.numeric','B5CEA8'],['constant.language','569CD6'],['constant.character.escape','D7BA7D'],['invalid','F44747']]},
  light: {base:'vs', colors:{'editor.background':'#fbfdfe','editor.foreground':'#182d36','editorLineNumber.foreground':'#728791','editorLineNumber.activeForeground':'#176b53','editor.selectionBackground':'#add6ff','editor.lineHighlightBackground':'#edf4f6','editorGutter.background':'#fbfdfe','editorWidget.background':'#ffffff','editorWidget.border':'#d7e1e5'},
    rules:[['keyword','0000FF'],['storage.modifier','0000FF'],['storage.type','267F99'],['entity.name.function','795E26'],['entity.name','001080'],['comment','008000'],['string','A31515'],['constant.numeric','098658'],['constant.language','0000FF'],['constant.character.escape','EE0000'],['invalid','CD3131']]}
};

class GrammarState {
  constructor(stack) { this.stack=stack; }
  clone() { return new GrammarState(this.stack); }
  equals(other) { return other instanceof GrammarState && this.stack.equals(other.stack); }
}

async function initialize() {
  window.__leanReaderPhase='Loading syntax tokenizer';
  const response = await fetch(new URL(wasmURL, import.meta.url));
  if(!response.ok)throw new Error('Could not load the Lean syntax tokenizer.');
  await oniguruma.loadWASM(await response.arrayBuffer());
  window.__leanReaderPhase='Loading official Lean grammar';
  const registry = new textmate.Registry({
    onigLib:Promise.resolve({createOnigScanner:patterns=>new oniguruma.OnigScanner(patterns),createOnigString:value=>new oniguruma.OnigString(value)}),
    loadGrammar:async scope=>scope==='source.lean4'?grammarSource:scope==='source.lean4.markdown'?markdownSource:null
  });
  const grammar = await registry.loadGrammar('source.lean4');
  window.__leanReaderPhase='Registering Lean syntax colors';
  monaco.languages.register({id:'lean4',extensions:['.lean','.txt'],aliases:['Lean 4']});
  monaco.languages.setTokensProvider('lean4',{
    getInitialState:()=>new GrammarState(textmate.INITIAL),
    tokenize(line,state){
      const result=grammar.tokenizeLine(line,state.stack);
      return {tokens:result.tokens.map(token=>{
        const scope=[...token.scopes].reverse().find(scope=>/^(keyword|storage|entity|comment|string|constant|invalid)\./.test(scope)) || 'source.lean4';
        return {startIndex:token.startIndex,scopes:scope};
      }),endState:new GrammarState(result.ruleStack)};
    }
  });
  monaco.languages.setLanguageConfiguration('lean4',{comments:{lineComment:'--',blockComment:['/-','-/']},brackets:[['(',')'],['[',']'],['{','}'],['⦃','⦄']],folding:{offSide:true}});
  for(const [name,theme] of Object.entries(themes))monaco.editor.defineTheme('riemann-'+name,{base:theme.base,inherit:true,colors:theme.colors,rules:theme.rules.map(([token,foreground])=>({token,foreground}))});
  monaco.languages.registerDocumentSymbolProvider('lean4',{
    provideDocumentSymbols(model){
      const result=[];
      const pattern=/^\s*(?:(?:private|protected|noncomputable|unsafe)\s+)*(theorem|lemma|def|abbrev|structure|class|instance|namespace)\s+([^\s:({\[]+)/u;
      for(let line=1;line<=model.getLineCount();line++){
        const value=model.getLineContent(line),match=pattern.exec(value);
        if(!match)continue;
        const start=value.indexOf(match[2])+1;
        result.push({name:match[2],detail:match[1],kind:match[1]==='namespace'?monaco.languages.SymbolKind.Namespace:match[1]==='structure'||match[1]==='class'?monaco.languages.SymbolKind.Struct:monaco.languages.SymbolKind.Function,tags:[],range:new monaco.Range(line,1,line,value.length+1),selectionRange:new monaco.Range(line,start,line,start+match[2].length)});
      }
      return result;
    }
  });
}

export async function createLeanReader(container, onCursor) {
  initializePromise ||= initialize();
  await initializePromise;
  window.__leanReaderPhase='Creating read-only editor';
  const models=new Map();
  const editor=monaco.editor.create(container,{
    model:null,readOnly:true,domReadOnly:true,readOnlyMessage:{value:'This public archive is read-only.'},
    theme:document.body.classList.contains('light')?'riemann-light':'riemann-dark',
    automaticLayout:true,fontFamily:'"DejaVu Sans Mono", "Cascadia Code", Consolas, monospace',fontSize:14,lineHeight:26,fontLigatures:false,
    lineNumbers:'on',minimap:{enabled:true,maxColumn:100,renderCharacters:false},scrollBeyondLastLine:false,smoothScrolling:true,
    padding:{top:18,bottom:18},wordWrap:'off',folding:true,foldingHighlight:false,showFoldingControls:'mouseover',glyphMargin:false,
    renderLineHighlight:'line',overviewRulerLanes:0,hideCursorInOverviewRuler:true,stickyScroll:{enabled:false},
    unicodeHighlight:{ambiguousCharacters:false,invisibleCharacters:false,nonBasicASCII:false},
    hover:{enabled:false},quickSuggestions:false,suggestOnTriggerCharacters:false,parameterHints:{enabled:false},
    contextmenu:true,links:false,ariaLabel:'Read-only Lean source, with syntax colors and line numbers'
  });
  let path;
  editor.onDidChangeCursorPosition(event=>{
    const model=editor.getModel();
    if(model)onCursor({line:event.position.lineNumber,offset:model.getOffsetAt(event.position)});
  });
  const observer=new MutationObserver(()=>monaco.editor.setTheme(document.body.classList.contains('light')?'riemann-light':'riemann-dark'));
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  const view={
    open(nextPath,text){
      if(path&&models.has(path))models.get(path).state=editor.saveViewState();
      let entry=models.get(nextPath);
      const restored=!!entry?.state;
      if(!entry){entry={model:monaco.editor.createModel(text,'lean4',monaco.Uri.from({scheme:'archive',path:'/text/'+nextPath})),state:null};models.set(nextPath,entry);}
      path=nextPath;editor.setModel(entry.model);
      if(entry.state)editor.restoreViewState(entry.state);
      editor.layout();
      return restored;
    },
    reveal(offset,length=0){
      const model=editor.getModel();if(!model)return;
      const start=model.getPositionAt(offset),end=model.getPositionAt(offset+length);
      const range=new monaco.Range(start.lineNumber,start.column,end.lineNumber,end.column);
      editor.setSelection(range);editor.revealRangeInCenterIfOutsideViewport(range,monaco.editor.ScrollType.Smooth);editor.focus();
    },
    setWrap(enabled){editor.updateOptions({wordWrap:enabled?'on':'off'});},
    close(file){const entry=models.get(file);if(!entry)return;if(editor.getModel()===entry.model)editor.setModel(null);entry.model.dispose();models.delete(file);},
    getValue(){return editor.getValue();},
    getPosition(){return editor.getPosition();},
    isReadOnly(){return editor.getOption(monaco.editor.EditorOption.readOnly)&&editor.getOption(monaco.editor.EditorOption.domReadOnly);},
    layout(){editor.layout();},
    dispose(){observer.disconnect();editor.dispose();for(const entry of models.values())entry.model.dispose();}
  };
  // Read-only inspection surface used by the local browser checks.
  window.riemannReader={getValue:()=>view.getValue(),getPosition:()=>view.getPosition(),isReadOnly:()=>view.isReadOnly()};
  window.__leanReaderPhase='Ready';
  return view;
}

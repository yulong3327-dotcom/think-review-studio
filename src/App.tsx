import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Braces, Check, ChevronLeft, ChevronRight, CircleHelp, ClipboardPaste, Code2, Copy, Download, FileCheck2, FileJson, FilePlus2, Files, FolderOpen, GitCompareArrows, LayoutDashboard, ListChecks, Loader2, Maximize2, PencilLine, Plus, Redo2, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Undo2, Upload, X } from 'lucide-react';
import samples from './data/samples.json';
import { FullPreview } from './components/FullPreview';
import { AiPanel } from './components/AiPanel';
import type { AiSelection } from './lib/ai';
import { parseThinkText, validateThink } from './lib/importer';
import { downloadBlob, downloadJson, exportZip, importFiles } from './lib/files';
import { isModified, loadWorkspace, makeDocument, saveWorkspace } from './lib/storage';
import type { ImportProblem, ReviewDocument, ReviewStatus, ThinkData } from './types';

const titles = ['物理课本宽度的估测','篮球筐高度的估测','成年男子手掌的长度','画中人物与物体的长度','冲锋号长度的估测','常见物体的长度估测','运动与静止的判断','参照物与位置变化','运动状态与参照物','生活中的相对运动','物体运动的相对性','参照物的选择','串联电路与欧姆定律','串联电路的分压关系','电阻棒的总阻值','通路、短路与断路','局部短路现象','并联电路的电流关系','热平衡与导热性','电路故障的判断','电源短路的分析','水面升高与入射角','光的折射现象','串联电路的电功率','并联电路的电功率','三电阻并联的电功率'];
const statusNames: Record<ReviewStatus,string> = {pending:'待审核',approved:'已通过',revision:'需修改'};
type WorkspaceTab = 'visual'|'json'|'diff';
type Modal = 'import'|'export'|'help'|null;

function initialDocuments() { return (samples as ThinkData[]).map((data,i)=>makeDocument(data,titles[i]||`参考讲解 ${i+1}`,'1V1-think 参考数据',true)); }
function Badge({ status }: {status:ReviewStatus}) { return <span className={`status-badge ${status}`}><i/>{statusNames[status]}</span>; }

export default function App() {
  const [documents,setDocuments] = useState<ReviewDocument[]>([]);
  const [loaded,setLoaded] = useState(false);
  const [activeId,setActiveId] = useState('');
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('all');
  const [selected,setSelected] = useState<Set<string>>(new Set());
  const [tab,setTab] = useState<WorkspaceTab>('visual');
  const [modal,setModal] = useState<Modal>(null);
  const [showSource,setShowSource] = useState(true);
  const [focusMode,setFocusMode] = useState(false);
  const [aiOpen,setAiOpen] = useState(false);
  const [aiSelection,setAiSelection] = useState<AiSelection|null>(null);
  const [pasteText,setPasteText] = useState('');
  const [importMode,setImportMode] = useState<'file'|'paste'>('file');
  const [problems,setProblems] = useState<ImportProblem[]>([]);
  const [importBusy,setImportBusy] = useState(false);
  const [toast,setToast] = useState('');
  const [saveState,setSaveState] = useState<'saving'|'saved'|'error'>('saved');
  const [rawDraft,setRawDraft] = useState('');
  const [rawDirty,setRawDirty] = useState(false);
  const [rawError,setRawError] = useState('');
  const [exportScope,setExportScope] = useState('all');
  const [exportFormat,setExportFormat] = useState('zip');
  const [includeReport,setIncludeReport] = useState(true);
  const [exportBusy,setExportBusy] = useState(false);
  const [historyVersion,setHistoryVersion] = useState(0);
  const histories = useRef(new Map<string,{past:ThinkData[];future:ThinkData[];last:number}>());
  const inputRef = useRef<HTMLInputElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const latestDocuments = useRef(documents);
  const active = documents.find(doc=>doc.id===activeId);
  const validation = useMemo(()=>active?validateThink(active.data):[],[active?.data]);
  const counts = useMemo(()=>({pending:documents.filter(doc=>doc.status==='pending').length,approved:documents.filter(doc=>doc.status==='approved').length,revision:documents.filter(doc=>doc.status==='revision').length,modified:documents.filter(isModified).length}),[documents]);
  const visible = useMemo(()=>documents.filter(doc=>(filter==='all'||(filter==='modified'?isModified(doc):doc.status===filter))&&`${doc.name} ${doc.source} ${doc.data.steps.map(s=>s.content||'').join(' ')}`.toLowerCase().includes(search.toLowerCase())),[documents,search,filter]);
  const exportDocuments = documents.filter(doc=>exportScope==='all'||(exportScope==='selected'?selected.has(doc.id):exportScope==='modified'?isModified(doc):exportScope==='current'?doc.id===activeId:doc.status==='approved'));
  const notify = useCallback((message:string)=>setToast(message),[]);

  useEffect(()=>{
    let canceled = false;
    loadWorkspace().then(saved=>{
      if(canceled)return;
      const docs = saved??initialDocuments();
      setDocuments(docs);setActiveId(docs[0]?.id||'');setLoaded(true);
    }).catch(()=>{if(canceled)return;const docs=initialDocuments();setDocuments(docs);setActiveId(docs[0]?.id||'');setLoaded(true);setSaveState('error');});
    return ()=>{canceled=true;};
  },[]);
  useEffect(()=>{latestDocuments.current=documents;},[documents]);
  useEffect(()=>{
    if(!loaded)return;
    setSaveState('saving');
    const timeout = setTimeout(()=>{
      saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveWorkspace(documents)).then(()=>setSaveState('saved')).catch(()=>setSaveState('error'));
    },400);
    return ()=>clearTimeout(timeout);
  },[documents,loaded]);
  useEffect(()=>{
    function pageHide(){void saveWorkspace(latestDocuments.current);}
    function beforeUnload(event:BeforeUnloadEvent){if(rawDirty||saveState!=='saved'){event.preventDefault();}}
    window.addEventListener('pagehide',pageHide);window.addEventListener('beforeunload',beforeUnload);
    return ()=>{window.removeEventListener('pagehide',pageHide);window.removeEventListener('beforeunload',beforeUnload);};
  },[rawDirty,saveState]);
  useEffect(()=>{if(!toast)return;const timeout=setTimeout(()=>setToast(''),4500);return ()=>clearTimeout(timeout);},[toast]);
  useEffect(()=>{if(!rawDirty)setRawDraft(active?JSON.stringify(active.data,null,2):'');},[active?.data,activeId,rawDirty]);
  useEffect(()=>{function escape(event:KeyboardEvent){if(event.key==='Escape'&&!importBusy&&!exportBusy)setModal(null);}window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[importBusy,exportBusy]);

  function updateData(update:(data:ThinkData)=>ThinkData, fromSource=false, forceHistory=false) {
    if(rawDirty&&!fromSource){notify('请先应用 JSON 源码修改，再编辑可视化内容。');return;}
    if(!active)return;
    const history=histories.current.get(active.id)||{past:[],future:[],last:0};
    if(forceHistory||Date.now()-history.last>700)history.past=[...history.past.slice(-49),structuredClone(active.data)];
    history.last=Date.now();history.future=[];histories.current.set(active.id,history);setHistoryVersion(v=>v+1);
    const data=update(structuredClone(active.data));
    setDocuments(docs=>docs.map(doc=>doc.id===active.id?{...doc,data,modifiedAt:new Date().toISOString()}:doc));
  }
  function updateMeta(values:Partial<ReviewDocument>) {if(active)setDocuments(docs=>docs.map(doc=>doc.id===active.id?{...doc,...values}:doc));}
  function switchDocument(id:string) {if(rawDirty){notify('请先应用或放弃源码修改，再切换数据。');return;}setActiveId(id);setRawError('');setAiSelection(null);}
  function switchTab(next:WorkspaceTab) {if(rawDirty&&next!=='json'){notify('源码修改尚未应用，请先点击「应用 JSON」。');return;}setTab(next);}
  function historyAction(direction:'past'|'future') {
    if(!active)return;const history=histories.current.get(active.id);if(!history?.[direction].length)return;
    const target=history[direction].pop()!;history[direction==='past'?'future':'past'].push(structuredClone(active.data));history.last=0;
    setDocuments(docs=>docs.map(doc=>doc.id===active.id?{...doc,data:target,modifiedAt:new Date().toISOString()}:doc));setHistoryVersion(v=>v+1);
  }
  function applyRaw(){
    try{const parsed=JSON.parse(rawDraft);const errors=validateThink(parsed);if(errors.length){setRawError(errors.join('；'));return;}updateData(()=>parsed,true);setRawDirty(false);setRawError('');notify('JSON 已应用，预览已同步。');}
    catch(error){setRawError(`JSON 语法错误：${(error as Error).message}`);}
  }
  function discardRaw(){setRawDirty(false);setRawDraft(active?JSON.stringify(active.data,null,2):'');setRawError('');}
  async function copyJson(){if(!active)return;try{await navigator.clipboard.writeText(JSON.stringify(active.data,null,2));notify('已复制修改后的 JSON。');}catch{notify('浏览器无法使用剪贴板，请使用导出 JSON。');}}
  function exportCurrent(){if(!active)return;if(rawDirty){notify('请先应用源码修改。');return;}if(validation.length){notify('请先修复数据校验问题再导出。');return;}downloadJson(active.data,active.name);notify('当前 JSON 已导出。');}
  function addImported(docs:ReviewDocument[],issues:ImportProblem[]){
    setProblems(issues);
    if(docs.length){setDocuments(existing=>existing.some(doc=>!doc.demo)?[...existing,...docs]:docs);setActiveId(docs[0].id);setSelected(new Set());setFilter('all');setSearch('');setTab('visual');notify(`已导入 ${docs.length} 条数据${issues.length?`，${issues.length} 项问题可查看详情`:''}。`);if(!issues.length){setModal(null);setPasteText('');}}
  }
  async function handleFiles(files:File[]){if(!files.length)return;setImportBusy(true);try{const result=await importFiles(files);addImported(result.documents,result.problems);}catch(error){setProblems([{source:'导入',message:(error as Error).message}]);}finally{setImportBusy(false);if(inputRef.current)inputRef.current.value='';}}
  function handlePaste(){const result=parseThinkText(pasteText);const issues=result.errors.map(message=>({source:'粘贴文本',message}));const docs:ReviewDocument[]=[];result.documents.forEach((data,i)=>{const errors=validateThink(data);if(errors.length){issues.push({source:`粘贴文本 · ${i+1}`,message:errors.join('；')});if(errors.some(e=>/必须是|至少需要|缺少/.test(e)))return;}docs.push(makeDocument(data,`导入讲解 · ${String(i+1).padStart(2,'0')}`,'粘贴文本'));});addImported(docs,issues);}
  function openImport(){if(rawDirty){notify('请先应用或放弃源码修改，再导入。');return;}setProblems([]);setModal('import');}
  async function runExport(){
    if(rawDirty){notify('请先应用源码修改。');return;}if(!exportDocuments.length)return;
    const invalid=exportDocuments.filter(doc=>validateThink(doc.data).length);if(invalid.length){notify(`${invalid.length} 条数据存在校验问题，请修复后导出。`);return;}
    setExportBusy(true);try{if(exportFormat==='zip')await exportZip(exportDocuments,includeReport);else if(exportFormat==='json')downloadJson(exportDocuments.map(doc=>doc.data),'Think_批量审核结果');else downloadBlob(new Blob([exportDocuments.map(doc=>JSON.stringify(doc.data)).join('\n')],{type:'application/x-ndjson;charset=utf-8'}),'Think_批量审核结果.jsonl');setModal(null);notify(`已导出 ${exportDocuments.length} 条数据。`);}catch(error){notify(`导出失败：${(error as Error).message}`);}finally{setExportBusy(false);}
  }
  function mark(status:ReviewStatus){if(rawDirty){notify('请先应用源码修改或修正绘图参数。');return;}if(status==='approved'&&validation.length){notify('数据存在校验问题，请修复后通过审核。');return;}updateMeta({status});notify(status==='approved'?'已标记为审核通过。':status==='revision'?'已标记为需要修改。':'已恢复待审核状态。');}

  const history=active?histories.current.get(active.id):undefined;void historyVersion;
  const activePosition=documents.findIndex(doc=>doc.id===activeId);

  return <div className={`app-shell ${focusMode?'focus-mode':''}`}>
    <aside className="sidebar">
      <a className="brand" href="./" aria-label="Think Studio 首页"><span className="brand-icon"><Braces size={23}/></span><span>think<span className="brand-light">studio</span><small>JSON 审核工作台</small></span></a>
      <div className="workspace-label">工作空间 <span>LOCAL</span></div>
      <nav>
        <button className={filter==='all'?'nav-item active':'nav-item'} onClick={()=>setFilter('all')}><LayoutDashboard size={18}/><span>审核工作台</span><ChevronRight size={14}/></button>
        <button className={filter==='pending'?'nav-item active':'nav-item'} onClick={()=>setFilter('pending')}><ListChecks size={18}/><span>待审核</span><b>{counts.pending}</b></button>
        <button className={filter==='approved'?'nav-item active':'nav-item'} onClick={()=>setFilter('approved')}><FileCheck2 size={18}/><span>已通过</span><b>{counts.approved}</b></button>
        <button className={filter==='modified'?'nav-item active':'nav-item'} onClick={()=>setFilter('modified')}><PencilLine size={18}/><span>我的修改</span><b>{counts.modified}</b></button>
      </nav>
      <div className="sidebar-divider"/>
      <div className="workspace-label">工具</div>
      <button className="nav-item" onClick={openImport}><FolderOpen size={18}/><span>批量导入</span><Plus size={15}/></button>
      <button className="nav-item" onClick={()=>{setExportScope('all');setModal('export');}}><ArrowDownToLine size={18}/><span>导出中心</span></button>
      <button className="nav-item" onClick={()=>setModal('help')}><CircleHelp size={18}/><span>使用指南</span><ArrowUpRight size={14}/></button>
      <div className="sidebar-bottom">
        <div className="local-card"><span className="local-card-icon"><ShieldCheck size={20}/></span><strong>数据保存在浏览器</strong><p>数据保存在当前浏览器中<br/>AI 调用时发送当前讲解。</p><div><span className="online-dot"/>本地工作空间</div></div>
        <div className="profile"><span className="avatar"><BookOpen size={18}/></span><span><strong>我的审核空间</strong><small>Think Studio 1.0</small></span><button className="icon-button" title="查看使用指南" onClick={()=>setModal('help')}><Settings2 size={17}/></button></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar compact-topbar"><div className="compact-title"><h1>审核工作台</h1><span className="compact-stat"><b>{documents.length}</b> 条数据</span><span className="compact-stat pending"><i/>{counts.pending} 待审</span><span className="compact-stat approved"><i/>{counts.approved} 通过</span><span className="compact-stat modified"><i/>{counts.modified} 修改</span></div><div className="topbar-right"><span className={`save-indicator ${saveState==='error'?'error':''}`}>{saveState==='saving'?<Loader2 className="spin" size={12}/>:saveState==='error'?<RefreshCw size={12}/>:<Check size={12}/>} {saveState==='saving'?'保存中':saveState==='error'?'保存失败':'已保存'}</span><button className="button secondary" onClick={()=>{setExportScope(selected.size?'selected':'all');setModal('export');}}><Download size={14}/>批量导出</button><button className="button primary" onClick={openImport}><Plus size={15}/>导入数据</button></div></header>
      {documents.length>0&&documents.every(doc=>doc.demo)&&<div className="demo-notice"><Sparkles size={14}/><span>已载入你提供的 <b>26 条参考数据</b>，可以直接体验审核。首次导入将替换参考数据。</span><button onClick={openImport}>导入我的数据 <ArrowRight size={13}/></button></div>}
      <section className="workspace">
        <aside className="queue">
          <div className="queue-header"><h2>讲解列表 <span>{visible.length}</span></h2><button className="icon-button" title="导入更多数据" onClick={openImport}><FilePlus2 size={17}/></button></div>
          <div className="search-box"><Search size={15}/><input aria-label="搜索讲解" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索标题或讲解内容"/>{search&&<button className="icon-button" title="清除搜索" onClick={()=>setSearch('')}><X size={13}/></button>}</div>
          <div className="queue-filters"><select aria-label="筛选审核状态" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部状态</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="revision">需修改</option><option value="modified">已修改</option></select><span>{visible.length} 条结果</span></div>
          <div className="queue-select"><label><input type="checkbox" aria-label="全选列表" checked={visible.length>0&&visible.every(doc=>selected.has(doc.id))} onChange={e=>setSelected(ids=>{const next=new Set(ids);visible.forEach(doc=>e.target.checked?next.add(doc.id):next.delete(doc.id));return next;})}/>{selected.size?`已选 ${selected.size} 条`:'全选'}</label>{selected.size>0&&<button onClick={()=>{setExportScope('selected');setModal('export');}}>导出所选 <Download size={12}/></button>}</div>
          <div className="document-list">
            {!loaded?<div className="empty-small"><Loader2 className="spin"/>正在加载…</div>:visible.length?visible.map(doc=>{const index=documents.indexOf(doc);return <div key={doc.id} className={`document-item ${doc.id===activeId?'selected':''}`}><input type="checkbox" aria-label={`选择 ${doc.name}`} checked={selected.has(doc.id)} onChange={e=>setSelected(ids=>{const next=new Set(ids);e.target.checked?next.add(doc.id):next.delete(doc.id);return next;})}/><button className="document-select" onClick={()=>switchDocument(doc.id)}><div className="document-number">{String(index+1).padStart(2,'0')}<span>{isModified(doc)?'已编辑':doc.demo?'参考数据':'Think JSON'}</span>{isModified(doc)&&<i className="modified-dot"/>}</div><strong>{doc.name}</strong><div className="document-details"><span>{doc.data.steps.length} 个步骤 <i>·</i> {(doc.data.func_list||[]).length} 个绘图</span><Badge status={doc.status}/></div></button></div>;}):<div className="empty-small"><Search size={23}/><strong>没有匹配的讲解</strong><span>换个关键词或筛选条件试试</span></div>}
          </div>
          <div className="queue-footer"><ShieldCheck size={13}/>修改只在你的浏览器中保存</div>
        </aside>
        <div className="review-area">
          {active?<><div className="document-top"><div><span className="doc-index">#{String(activePosition+1).padStart(3,'0')}</span><h2>{active.name}</h2><button className="icon-button" title="重命名讲解" onClick={()=>{const name=window.prompt('讲解名称',active.name);if(name?.trim())updateMeta({name:name.trim()});}}><PencilLine size={14}/></button><Badge status={active.status}/></div><div className="document-controls"><button className="icon-button" title="上一条讲解" disabled={activePosition===0} onClick={()=>switchDocument(documents[activePosition-1].id)}><ChevronLeft size={17}/></button><span>{activePosition+1} / {documents.length}</span><button className="icon-button" title="下一条讲解" disabled={activePosition===documents.length-1} onClick={()=>switchDocument(documents[activePosition+1].id)}><ChevronRight size={17}/></button></div></div>
            <div className="workspace-tabs"><div><button className={tab==='visual'?'active':''} onClick={()=>switchTab('visual')}><BookOpen size={15}/>可视化审核</button><button className={tab==='json'?'active':''} onClick={()=>switchTab('json')}><Code2 size={15}/>JSON 源码{rawDirty&&<i className="modified-dot"/>}</button><button className={tab==='diff'?'active':''} onClick={()=>switchTab('diff')}><GitCompareArrows size={15}/>修改对比{isModified(active)&&<span className="tiny-count">1</span>}</button></div><div className="history-controls"><button className={`workspace-view-button ${aiOpen?'active':''}`} title="圈选内容，让 AI 修改 JSON" onClick={()=>{if(rawDirty){notify('请先应用源码修改。');return;}setAiOpen(v=>!v);setTab('visual');setShowSource(false);}}><Sparkles size={14}/><span>{aiOpen?'退出 AI':'AI 圈选'}</span></button><button className={`workspace-view-button ${showSource?'active':''}`} onClick={()=>{if(rawDirty&&!showSource){notify('请先应用源码修改。');return;}setShowSource(v=>!v);}} title={showSource?'隐藏 JSON 栏，放大预览':'显示对应 JSON 源码'}><Braces size={14}/><span>{showSource?'隐藏 JSON':'显示 JSON'}</span></button><button className={`workspace-view-button ${focusMode?'active':''}`} onClick={()=>setFocusMode(v=>!v)} title={focusMode?'退出专注审核':'专注审核，放大工作区'}><Maximize2 size={14}/><span>{focusMode?'退出专注':'专注审核'}</span></button><span className="tab-divider"/><button className="icon-button" title="撤销修改" disabled={!history?.past.length||rawDirty} onClick={()=>historyAction('past')}><Undo2 size={16}/></button><button className="icon-button" title="重做修改" disabled={!history?.future.length||rawDirty} onClick={()=>historyAction('future')}><Redo2 size={16}/></button><span className="tab-divider"/><button className="icon-button" title="复制 JSON" onClick={copyJson}><Copy size={15}/></button></div></div>
            {validation.length>0&&<div className="validation-banner">数据校验：{validation.join('；')}</div>}
            {tab==='visual'?<div className={`linked-workspace ${showSource?'':'source-hidden'}`}>{showSource&&<aside className="linked-json-pane"><div className="linked-json-header"><span><Braces size={14}/>JSON 源码</span><button className="button primary small" disabled={!rawDirty} onClick={applyRaw}><Check size={12}/>应用</button></div>{rawError&&<div className="validation-banner">{rawError}</div>}<textarea aria-label="对应 JSON 源码" className="code-editor linked-json-editor" spellCheck={false} value={rawDraft} onChange={e=>{setRawDraft(e.target.value);setRawDirty(true);}}/><div className="linked-json-footer"><span className="online-dot"/>{rawDirty?'源码有未应用的修改':'与可视化内容同步'}<span>{rawDraft.split('\n').length} 行</span></div></aside>}<FullPreview key={`preview-${active.id}`} document={active} onChange={updateData} onMeta={updateMeta} onMark={mark} notify={notify} aiMode={aiOpen} onAiSelect={setAiSelection}/>{aiOpen&&<AiPanel key={`ai-${active.id}`} document={active} selection={aiSelection} rawDirty={rawDirty} onClose={()=>setAiOpen(false)} onApply={data=>{updateData(()=>data,false,true);notify('AI 修改已应用，可视化与 JSON 已同步。');}}/>}</div>:tab==='json'?<div className="raw-workspace"><div className="raw-toolbar"><span><FileJson size={16}/>完整 JSON <small>原始字段与函数代码完整保留</small></span><div>{rawDirty&&<button className="button secondary small" onClick={discardRaw}>放弃修改</button>}<button className="button secondary small" onClick={()=>{try{setRawDraft(JSON.stringify(JSON.parse(rawDraft),null,2));setRawError('');}catch(error){setRawError((error as Error).message);}}}><Braces size={13}/>格式化</button><button className="button primary small" disabled={!rawDirty} onClick={applyRaw}><Check size={13}/>应用 JSON</button></div></div>{rawError&&<div className="validation-banner">{rawError}</div>}<textarea className="code-editor raw-editor" aria-label="完整 JSON 源码" spellCheck={false} value={rawDraft} onChange={e=>{setRawDraft(e.target.value);setRawDirty(true);}}/><div className="raw-footer">{rawDirty?'源码修改尚未应用，应用后将同步到可视化预览。':'JSON 语法有效 · 修改后点击「应用 JSON」同步预览'}<span>{rawDraft.split('\n').length} 行</span></div></div>:<div className="diff-workspace"><div className="diff-header"><GitCompareArrows size={17}/><h3>原始数据与当前版本</h3><span>{isModified(active)?'已有修改':'暂无修改'}</span></div><div className="diff-columns"><div><h4>导入时的原始 JSON</h4><pre>{JSON.stringify(active.original,null,2).split('\n').map((line,i)=><div key={i} className={line!==JSON.stringify(active.data,null,2).split('\n')[i]?'line-removed':''}><span>{i+1}</span>{line}</div>)}</pre></div><div><h4>修改后的 JSON</h4><pre>{JSON.stringify(active.data,null,2).split('\n').map((line,i)=><div key={i} className={line!==JSON.stringify(active.original,null,2).split('\n')[i]?'line-added':''}><span>{i+1}</span>{line}</div>)}</pre></div></div></div>}
            <div className="workspace-bottom"><span><span className="online-dot"/>{isModified(active)?'修改已记录':'数据已就绪'}<i>·</i>{active.source}</span><button onClick={exportCurrent}><Download size={14}/>导出当前 JSON <ArrowUpRight size={13}/></button></div>
          </>:<div className="empty-workspace"><span><Braces size={40}/></span><h2>开始你的第一次批量审核</h2><p>导入 Think JSON，让讲解、公式和绘图一起呈现。</p><button className="button primary" onClick={openImport}><Upload size={16}/>导入数据</button></div>}
        </div>
      </section>
    </main>
    <input ref={inputRef} type="file" multiple accept=".json,.jsonl,.txt,.csv,.xlsx,.zip" className="hidden-file" onChange={e=>handleFiles(Array.from(e.target.files||[]))}/>
    {modal&&<div className="modal-backdrop" onClick={()=>{if(!importBusy&&!exportBusy)setModal(null);}}><section className={`modal ${modal==='help'?'help-modal':''}`} role="dialog" aria-modal="true" aria-label={modal==='import'?'批量导入':modal==='export'?'批量导出':'使用指南'} onClick={e=>e.stopPropagation()}>
      <div className="modal-heading"><span className="modal-icon">{modal==='import'?<Upload size={22}/>:modal==='export'?<Download size={22}/>:<BookOpen size={22}/>}</span><button className="icon-button" aria-label="关闭弹窗" disabled={importBusy||exportBusy} onClick={()=>setModal(null)}><X size={20}/></button></div>
      {modal==='import'?<><h2>一次导入，批量处理</h2><p className="modal-description">把重复的复制粘贴，交给工作台。</p><div className="modal-tabs"><button className={importMode==='file'?'active':''} onClick={()=>setImportMode('file')}><FolderOpen size={15}/>文件导入</button><button className={importMode==='paste'?'active':''} onClick={()=>setImportMode('paste')}><ClipboardPaste size={15}/>批量粘贴</button></div>
        {importMode==='file'?<div className={`dropzone ${importBusy?'busy':''}`} role="button" tabIndex={0} aria-label="选择或拖入文件" onClick={()=>!importBusy&&inputRef.current?.click()} onKeyDown={e=>{if(e.key==='Enter'&&!importBusy)inputRef.current?.click();}} onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add('dragging');}} onDragLeave={e=>e.currentTarget.classList.remove('dragging')} onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');if(!importBusy)void handleFiles(Array.from(e.dataTransfer.files));}}>{importBusy?<Loader2 className="spin" size={34}/>:<Files size={34}/>}<strong>{importBusy?'正在解析数据…':'拖入文件，或点击选择'}</strong><span>支持多个文件，也支持包含多条数据的单个文件</span><div>{['JSON','JSONL','TXT','CSV','XLSX','ZIP'].map(format=><b key={format}>{format}</b>)}</div></div>:<label className="paste-field"><textarea aria-label="批量 JSON 文本" spellCheck={false} value={pasteText} onChange={e=>setPasteText(e.target.value)} placeholder={'在这里粘贴一条或多条 Think JSON…\n\n支持 JSON 数组、连续 JSON、Markdown 代码块、\nExcel 复制文本和带双引号的内容。'}/></label>}
        <div className="import-tip"><ShieldCheck size={16}/><span><strong>原始结构完整保留</strong><br/>自动识别 steps 与 func_list，兼容表格复制中的转义双引号。XLSX 中每个 JSON 占一个单元格。</span></div>
        {problems.length>0&&<div className="import-problems"><strong>{problems.length} 项需要注意</strong>{problems.map((problem,i)=><p key={i}><b>{problem.source}</b><br/>{problem.message}</p>)}</div>}
        <div className="modal-footer"><span>数据仅在你的浏览器中处理</span>{importMode==='paste'?<button className="button primary" disabled={!pasteText.trim()} onClick={handlePaste}><Plus size={15}/>解析并导入</button>:<button className="button primary" disabled={importBusy} onClick={()=>inputRef.current?.click()}><FolderOpen size={15}/>选择文件</button>}</div>
      </>:modal==='export'?<><h2>把修改，完整带走</h2><p className="modal-description">导出可继续使用的 Think JSON，保留全部原始字段。</p><label className="editor-field"><span>导出范围</span><select aria-label="导出范围" value={exportScope} onChange={e=>setExportScope(e.target.value)}><option value="all">全部数据（{documents.length} 条）</option><option value="selected">已勾选（{selected.size} 条）</option><option value="modified">已修改（{counts.modified} 条）</option><option value="approved">已通过（{counts.approved} 条）</option><option value="current">当前讲解（{active?1:0} 条）</option></select></label><div className="export-formats">{[{key:'zip',icon:<FolderOpen size={21}/>,title:'独立 JSON 文件',detail:'每条一个文件 · ZIP 打包'},{key:'json',icon:<Braces size={21}/>,title:'JSON 数组',detail:'所有讲解合并为一个文件'},{key:'jsonl',icon:<FileJson size={21}/>,title:'JSONL 文件',detail:'每行一条 · 便于批处理'}].map(format=><button key={format.key} className={exportFormat===format.key?'selected':''} onClick={()=>setExportFormat(format.key)}>{format.icon}<strong>{format.title}</strong><span>{format.detail}</span>{exportFormat===format.key&&<Check size={14}/>}</button>)}</div>{exportFormat==='zip'&&<label className="export-check"><input type="checkbox" checked={includeReport} onChange={e=>setIncludeReport(e.target.checked)}/>附带审核状态与意见报告<span>单独保存，不写入讲解 JSON</span></label>}<div className="export-summary"><Files size={18}/>即将导出 <strong>{exportDocuments.length} 条</strong> 讲解</div><div className="modal-footer"><span>修改后的 JSON · 原格式输出</span><button className="button primary" disabled={!exportDocuments.length||exportBusy} onClick={runExport}>{exportBusy?<Loader2 className="spin" size={15}/>:<Download size={15}/>}确认导出</button></div></>:<><h2>你的 Think 审核工作台</h2><p className="modal-description">导入 → 检查 → 修改 → 导出，四步完成审核。</p><div className="guide-list">{[{title:'01  批量导入',text:'选择多个 JSON、TXT、CSV、JSONL 文件，也可导入 XLSX 或 ZIP。批量粘贴支持原始文本中的双引号与 Markdown 包裹。首次导入会替换参考数据。'},{title:'02  可视化检查',text:'从列表选中讲解，整份内容、公式、旁白与绘图会一次完整展示。搜索和状态筛选帮助你快速定位。'},{title:'03  即时修改',text:'直接点击讲解文字和旁白进行编辑；点击图中的标签可修改文字并写回函数代码。「修改绘图」可就地编辑函数代码与参数。完整 JSON 可在源码页编辑，点击「应用 JSON」后生效。'},{title:'04  审核与导出',text:'记录意见，标记「需修改」或「审核通过」。可按所选、已修改、已通过批量导出。ZIP 内每条一个 JSON，并可附带单独的审核意见报告。'}].map(item=><div key={item.title}><strong>{item.title}</strong><p>{item.text}</p></div>)}</div><div className="help-note"><ShieldCheck size={18}/><p>讲解保存在当前浏览器的本地数据库中。清除浏览器数据或换浏览器前，请先导出备份。绘图沙箱支持 DOM / Canvas / SVG；依赖外部库或远程资源的绘图，需要改为自包含代码。</p></div><div className="modal-footer"><span>Think Studio · 本地版</span><button className="button primary" onClick={()=>setModal(null)}>开始审核 <ArrowRight size={15}/></button></div></>}
    </section></div>}
    {toast&&<div className="toast" role="status"><Check size={16}/><span>{toast}</span><button className="icon-button" title="关闭提示" onClick={()=>setToast('')}><X size={14}/></button></div>}
  </div>;
}

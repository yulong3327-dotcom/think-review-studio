import { useEffect,useRef,useState } from 'react';
import { Check,Loader2,Settings2,Sparkles,X } from 'lucide-react';
import { AI_BASE,AI_SETTINGS_KEY,readAiSettings,requestAi,sameData } from '../lib/ai';
import type { AiProposal,AiSelection } from '../lib/ai';
import type { ReviewDocument,ThinkData } from '../types';

export function AiPanel({document,selection,onApply,onClose,rawDirty}:{document:ReviewDocument;selection:AiSelection|null;onApply:(data:ThinkData)=>void;onClose:()=>void;rawDirty:boolean}) {
  const [settings,setSettings]=useState(readAiSettings);
  const [settingsOpen,setSettingsOpen]=useState(!settings.apiKey);
  const [problem,setProblem]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [result,setResult]=useState<AiProposal|null>(null);
  const [base,setBase]=useState<ThinkData|null>(null);
  const controller=useRef<AbortController|null>(null);
  const serial=useRef(0);
  const stale=!!base&&!sameData(base,document.data);
  useEffect(()=>()=>{serial.current++;controller.current?.abort();},[]);
  async function generate(){
    if(!selection||!problem.trim()||!settings.apiKey.trim())return;
    const id=++serial.current;controller.current?.abort();controller.current=new AbortController();
    setBusy(true);setError('');setResult(null);const original=structuredClone(document.data);setBase(original);
    try{const proposal=await requestAi(original,selection,problem,settings,controller.current.signal);if(id===serial.current)setResult(proposal);}
    catch(e){if(id===serial.current)setError((e as Error).name==='AbortError'?'已取消 AI 请求。':(e as Error).message);}
    finally{if(id===serial.current)setBusy(false);}
  }
  function cancel(){serial.current++;controller.current?.abort();setBusy(false);setError('已取消 AI 请求。');}
  function save(){try{localStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(settings));setSettingsOpen(false);setError('');}catch{setError('设置无法保存，请检查浏览器存储权限。');}}
  function clear(){localStorage.removeItem(AI_SETTINGS_KEY);setSettings({...settings,apiKey:''});setSettingsOpen(true);}
  return <aside className="ai-panel" aria-label="AI 修改面板">
    <div className="ai-heading"><Sparkles size={17}/><strong>AI 辅助修改</strong><button className="icon-button" title="AI 服务设置" onClick={()=>setSettingsOpen(v=>!v)}><Settings2 size={16}/></button><button className="icon-button" aria-label="关闭 AI 面板" onClick={onClose}><X size={16}/></button></div>
    <div className="ai-scroll">
      {settingsOpen&&<div className="ai-settings"><label>服务地址<input readOnly value={AI_BASE} aria-label="AI 服务地址"/></label><label>模型<input value={settings.model} aria-label="AI 模型" onChange={e=>setSettings({...settings,model:e.target.value})}/></label><label>API 密钥<input type="password" autoComplete="off" value={settings.apiKey} aria-label="AI API 密钥" onChange={e=>setSettings({...settings,apiKey:e.target.value})} placeholder="输入服务密钥"/></label><small>仅保存在当前浏览器。调用 AI 时，将发送当前 JSON 和选中区域至上述服务。</small><div><button className="button primary small" onClick={save} disabled={!settings.model.trim()}>保存设置</button><button className="text-control" onClick={clear}>清除密钥</button></div></div>}
      <div className="ai-selection"><strong>选中内容</strong>{selection?<><span>第 {selection.stepIndex+1} 个区块 · {selection.kind==='drawing'?'图形区域':selection.kind==='narration'?'旁白':'讲解'}</span>{selection.text&&<blockquote>{selection.text}</blockquote>}{selection.image&&<img src={selection.image} alt="框选的错误区域"/>}{selection.region&&<small>区域：左 {Math.round(selection.region.x*100)}% · 上 {Math.round(selection.region.y*100)}%</small>}</>:<p>在右侧讲解中拖选文字，或在图中拖动框选错误区域。也可点击区块上的「AI 修改」。</p>}</div>
      <label className="ai-problem">告诉 AI 问题<textarea aria-label="告诉 AI 问题" value={problem} onChange={e=>setProblem(e.target.value)} placeholder="例如：此处长度单位写错了，请改成 cm，并同步修改旁白。" rows={4}/></label>
      <div className="ai-run">{busy?<button className="button secondary" onClick={cancel}><Loader2 size={14} className="spin"/>取消生成</button>:<button className="button primary" onClick={generate} disabled={!selection||!problem.trim()||!settings.apiKey.trim()||rawDirty}><Sparkles size={14}/>{result?'重新生成建议':'生成修改建议'}</button>}</div>
      {rawDirty&&<p className="field-error">请先应用或放弃 JSON 源码修改。</p>}
      {error&&<p className="ai-error" role="alert">{error}</p>}
      {result&&<div className="ai-result"><h4>{result.summary}</h4><p>{result.changes.length} 个字段待修改</p>{result.changes.map(change=>{const path=change.path.split('/').slice(1);const old=path.reduce((value,key)=>value?.[key],base as unknown as Record<string,any>);return <div className="ai-change" key={change.path}><code>{change.path}</code><small>修改前</small><pre>{typeof old==='string'?old:JSON.stringify(old)}</pre><small>修改后</small><pre className="ai-after">{typeof change.value==='string'?change.value:JSON.stringify(change.value)}</pre></div>;})}{stale&&<p className="ai-error">JSON 在生成期间已被修改，请重新生成建议。</p>}<button className="button primary" disabled={stale||rawDirty||busy} onClick={()=>{onApply(result.data);setResult(null);setBase(null);}}><Check size={14}/>应用到 JSON</button></div>}
    </div><div className="ai-footer">应用后同步可视化 · 支持撤销</div>
  </aside>;
}

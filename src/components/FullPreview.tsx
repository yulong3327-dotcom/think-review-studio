import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Braces, Check, CheckCheck, Code2, ListChecks, MessageSquare, PencilLine, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { DrawingPreview } from './DrawingPreview';
import { MathText } from './MathText';
import { replaceDrawingLabel } from '../lib/drawing-edit';
import type { ReviewDocument, ThinkData, ThinkStep } from '../types';
import type { AiSelection } from '../lib/ai';

interface Props {
  document:ReviewDocument;
  onChange:(transform:(data:ThinkData)=>ThinkData)=>void;
  onMeta:(values:Partial<ReviewDocument>)=>void;
  onMark:(status:'pending'|'approved'|'revision')=>void;
  notify:(message:string)=>void;
  aiMode?:boolean;
  onAiSelect?:(selection:AiSelection)=>void;
}

function InlineText({value,onChange,label,kind='content',aiMode=false,onSelect}:{value:string;onChange:(value:string)=>void;label:string;kind?:string;aiMode?:boolean;onSelect?:(text:string)=>void}) {
  const [editing,setEditing]=useState(false);
  if(aiMode)return <div className={`inline-text ${kind} ai-selectable`} onMouseUp={e=>{const selection=window.getSelection();if(selection?.anchorNode&&e.currentTarget.contains(selection.anchorNode)&&selection.focusNode&&e.currentTarget.contains(selection.focusNode)&&selection.toString().trim())onSelect?.(selection.toString());}}>{kind==='content'?<MathText text={value}/>:<p>{value||'暂无旁白'}</p>}</div>;
  return <div className={`inline-text ${kind} ${editing?'editing':''}`}>
    {editing?<div className="inline-edit-box"><textarea aria-label={label} autoFocus value={value} rows={Math.max(3,Math.min(9,value.split('\n').length+2))} onChange={e=>onChange(e.target.value)}/><div><span>{kind==='content'?'支持 LaTeX 公式 · 修改自动写回 JSON':'修改自动写回 JSON'}</span><button onClick={()=>setEditing(false)}><Check size={13}/>完成</button></div></div>:<button className="inline-rendered" aria-label={`编辑${label}`} title="点击这里直接修改" onClick={()=>setEditing(true)}>{kind==='content'?<MathText text={value}/>:<p>{value||'点击添加旁白…'}</p>}<span className="inline-pencil"><PencilLine size={13}/></span></button>}
  </div>;
}

function Lesson({step,index,total,functions,onChange,notify,showNarration,aiMode,onAiSelect}:{step:ThinkStep;index:number;total:number;functions:ThinkData['func_list'];onChange:Props['onChange'];notify:Props['notify'];showNarration:boolean;aiMode?:boolean;onAiSelect?:Props['onAiSelect']}) {
  const [codeOpen,setCodeOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [picked,setPicked]=useState<{before:string;after:string}|null>(null);
  const [pickError,setPickError]=useState('');
  const [params,setParams]=useState(JSON.stringify(step.func_params||[]));
  const [paramsError,setParamsError]=useState('');
  const functionIndex=(functions||[]).findIndex(fn=>fn.name===step.func&&(fn['question-index']===undefined||String(fn['question-index'])===String(step['question-index']??1)));
  const fn=functions?.[functionIndex];
  useEffect(()=>{setParams(JSON.stringify(step.func_params||[]));setParamsError('');},[step.func_params]);
  function changeStep(values:Partial<ThinkStep>){onChange(data=>{data.steps[index]={...data.steps[index],...values};return data;});}
  function move(direction:number){onChange(data=>{const target=index+direction;[data.steps[index],data.steps[target]]=[data.steps[target],data.steps[index]];return data;});}
  function remove(){if(total===1){notify('至少需要保留一个讲解区块。');return;}onChange(data=>{data.steps.splice(index,1);return data;});notify('已删除区块，可以撤销恢复。');}
  function labelPicked(text:string){setPicked({before:text,after:text});setPickError('');}
  function applyLabel(){
    if(!picked||!fn)return;
    try{const result=replaceDrawingLabel(fn.func,picked.before,picked.after);if(!result.count){setPickError('这段文字由变量或表达式生成，请展开下方绘图代码修改对应值。');setCodeOpen(true);return;}
      onChange(data=>{data.func_list![functionIndex].func=result.code;return data;});setPicked(null);notify('图中文字已修改，并同步到绘图函数代码。');
    }catch(error){setPickError(`绘图代码解析失败：${(error as Error).message}`);setCodeOpen(true);}
  }
  return <article className="lesson-card full-lesson">
    <div className="lesson-step-header"><span className={`step-type ${step.type==='答案'?'answer':''}`}>{step.type==='答案'?<CheckCheck size={15}/>:step.type==='解题关键'?<Sparkles size={15}/>:<ListChecks size={15}/>} {step.type||'讲解'}</span><span className="block-index">{String(index+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span><div className="block-actions"><button className="icon-button" title={`第 ${index+1} 个区块上移`} disabled={!index} onClick={()=>move(-1)}><ArrowUp size={13}/></button><button className="icon-button" title={`第 ${index+1} 个区块下移`} disabled={index===total-1} onClick={()=>move(1)}><ArrowDown size={13}/></button><button className="icon-button" title={`设置第 ${index+1} 个区块`} onClick={()=>setSettingsOpen(v=>!v)}><PencilLine size={13}/></button><button className="icon-button danger" title={`删除第 ${index+1} 个区块`} onClick={remove}><Trash2 size={13}/></button></div></div>
    {settingsOpen&&<div className="inline-settings"><label>类型<select aria-label={`第 ${index+1} 个区块类型`} value={step.type||'分步讲解'} onChange={e=>changeStep({type:e.target.value})}>{['解题关键','分步讲解','答案','知识总结','易错提醒',...(!['解题关键','分步讲解','答案','知识总结','易错提醒'].includes(step.type||'')?[step.type||'讲解']:[])].map(type=><option key={type}>{type}</option>)}</select></label><label>题号<input aria-label={`第 ${index+1} 个区块题号`} type="number" min="1" value={step['question-index']??1} onChange={e=>changeStep({'question-index':Number(e.target.value)||1})}/></label><label className="drawing-link-field">绘图<select aria-label={`第 ${index+1} 个区块关联绘图`} value={step.func||''} onChange={e=>onChange(data=>{if(e.target.value)data.steps[index].func=e.target.value;else{delete data.steps[index].func;delete data.steps[index].func_params;}return data;})}><option value="">不关联绘图</option>{(functions||[]).filter(f=>f['question-index']===undefined||String(f['question-index'])===String(step['question-index']??1)).map((f,i)=><option key={i}>{f.name}</option>)}</select></label></div>}
    {aiMode&&<button className="ai-block-button" onClick={()=>onAiSelect?.({stepIndex:index,kind:'content',text:step.content})}><Sparkles size={13}/>AI 修改此区块</button>}
    <InlineText value={step.content||''} onChange={content=>changeStep({content})} label={`第 ${index+1} 个区块讲解`} aiMode={aiMode} onSelect={text=>onAiSelect?.({stepIndex:index,kind:'content',text})}/>
    {step.func&&<div className="figure"><div className="figure-title"><span className="figure-dot"/>示意图 <span className="figure-help">{aiMode?'拖动框选错误部分':'点击图中文字即可修改'}</span><button className="figure-edit-button" onClick={()=>setCodeOpen(v=>!v)}><Code2 size={13}/>{codeOpen?'收起代码':'修改绘图'}</button></div><DrawingPreview step={step} functions={functions||[]} onPickLabel={labelPicked} aiMode={aiMode} onRegion={(region,image)=>onAiSelect?.({stepIndex:index,kind:'drawing',region,image})}/>
      {picked&&<div className="drawing-label-editor"><div><PencilLine size={14}/><strong>修改图中文字</strong><button className="icon-button" aria-label="取消图中文字修改" onClick={()=>setPicked(null)}><X size={13}/></button></div><label><input aria-label="图中文字" autoFocus value={picked.after} onChange={e=>setPicked({...picked,after:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')applyLabel();}}/><button className="button primary small" onClick={applyLabel}><Check size={12}/>应用</button></label>{pickError&&<p>{pickError}</p>}<small>同步修改 JSON 中的函数代码；引用该函数的图会一起更新。</small></div>}
      {codeOpen&&<div className="inline-drawing-code"><div className="inline-drawing-toolbar"><span><Code2 size={14}/>{step.func}</span><label>绘图参数<input className="mono" aria-label={`第 ${index+1} 个区块绘图参数`} value={params} onChange={e=>{setParams(e.target.value);try{const value=JSON.parse(e.target.value);if(!Array.isArray(value))throw new Error();setParamsError('');changeStep({func_params:value});}catch{setParamsError('参数必须是 JSON 数组，例如 [2]。');}}}/></label></div>{paramsError&&<p className="field-error">{paramsError}</p>}{fn?<textarea className="code-editor" spellCheck={false} aria-label={`第 ${index+1} 个区块绘图代码`} value={fn.func} onChange={e=>onChange(data=>{data.func_list![functionIndex].func=e.target.value;return data;})}/>:<p>未找到绘图函数，请在 JSON 源码中检查引用。</p>}<div className="inline-code-footer">修改代码后，图形会即时更新。<button onClick={()=>setCodeOpen(false)}><Check size={12}/>完成</button></div></div>}
      <div className="figure-caption">{step.func}<span>绘图与 JSON 同步</span></div></div>}
    {showNarration&&<div className="narration"><div><MessageSquare size={14}/><strong>讲解旁白</strong><span>{aiMode?'拖选文字':'点击修改'}</span></div><InlineText kind="narration-text" value={step.narration||''} onChange={narration=>changeStep({narration})} label={`第 ${index+1} 个区块旁白`} aiMode={aiMode} onSelect={text=>onAiSelect?.({stepIndex:index,kind:'narration',text})}/></div>}
  </article>;
}

export function FullPreview({document,onChange,onMeta,onMark,notify,aiMode,onAiSelect}:Props) {
  const [showNarration,setShowNarration]=useState(false);
  const functions=document.data.func_list||[];
  return <div className="full-visual-workspace">
    <div className="full-preview-toolbar"><span><span className="online-dot"/>{aiMode?'AI 圈选 · 拖选文字或框选图形':'可视化 · 完整讲解'}</span><button className={`text-control ${showNarration?'enabled':''}`} onClick={()=>setShowNarration(v=>!v)}><MessageSquare size={13}/>{showNarration?'收起旁白':'显示旁白'}</button></div>
    <div className="full-preview-scroll"><div className="full-document">
      <div className="document-intro"><span>THINK EXPLANATION</span><h3>{document.name}</h3><p>这是一份可直接编辑的完整讲解。点击内容开始修改。</p></div>
      {document.data.steps.map((step,index)=><Lesson key={`${document.id}-${index}`} step={step} index={index} total={document.data.steps.length} functions={functions} onChange={onChange} notify={notify} showNarration={showNarration} aiMode={aiMode} onAiSelect={onAiSelect}/>)}
      <button className="add-block-button" onClick={()=>onChange(data=>{data.steps.push({'question-index':data.steps.at(-1)?.['question-index']??1,type:'分步讲解',content:'点击这里填写新讲解',narration:''});return data;})}><Plus size={14}/>添加讲解区块</button>
      <div className="full-review-note"><div><MessageSquare size={16}/><strong>审核意见</strong><span>单独记录，导出时可附带</span></div><textarea aria-label="审核意见" value={document.note} placeholder="记录需要调整的地方…" onChange={e=>onMeta({note:e.target.value})}/></div>
      <div className="preview-end"><span/>完整讲解已展示<span/></div>
    </div></div>
    <div className="full-review-actions"><span><Braces size={14}/>所见即所改 · 自动同步到 JSON</span><div><button className="button secondary" onClick={()=>onMark(document.status==='revision'?'pending':'revision')}><PencilLine size={14}/>{document.status==='revision'?'恢复待审':'需修改'}</button><button className="button primary" onClick={()=>onMark(document.status==='approved'?'pending':'approved')}><Check size={15}/>{document.status==='approved'?'撤销通过':'审核通过'}</button></div></div>
  </div>;
}

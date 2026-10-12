import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ThinkFunction, ThinkStep } from '../types';
import type { AiSelection } from '../lib/ai';

export function DrawingPreview({ step, functions, onPickLabel,aiMode,onRegion }: {step:ThinkStep;functions:ThinkFunction[];onPickLabel?:(text:string)=>void;aiMode?:boolean;onRegion?:(region:NonNullable<AiSelection['region']>,image?:string)=>void}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error,setError] = useState('');
  const [height,setHeight] = useState(280);
  const [reload,setReload] = useState(0);
  const [box,setBox]=useState<{x:number;y:number;endX:number;endY:number}|null>(null);
  const drag=useRef<{x:number;y:number}|null>(null);
  const pending=useRef<{id:string;region:NonNullable<AiSelection['region']>;timer:ReturnType<typeof setTimeout>}|null>(null);
  const target = functions.find(fn=>fn.name===step.func && (fn['question-index']===undefined || String(fn['question-index'])===String(step['question-index']??1)));
  const source = useMemo(() => {
    const payload = JSON.stringify({functions:functions.filter(fn=>fn['question-index']===undefined||String(fn['question-index'])===String(step['question-index']??1)),name:step.func,params:step.func_params||[]}).replace(/</g,'\\u003c');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none';"><style>html,body{margin:0;background:#fff;font-family:Arial,sans-serif}body{position:relative}#drawing{width:100%;overflow:hidden}canvas,svg,img{max-width:100%}*{box-sizing:border-box}.label-hotspot{position:absolute;border:1px solid transparent;border-radius:3px;background:transparent;padding:0;cursor:text}.label-hotspot:hover,.label-hotspot:focus{border-color:#83a474;background:#83a4740b;outline:none}</style></head><body><div id="drawing"></div><div id="label-tools"></div><script>
    const data=${payload};const container=document.getElementById('drawing');let failed=false;
    const report=(error)=>{failed=true;parent.postMessage({type:'think-drawing-error',message:String(error.message||error)},'*')};
    const labels=new WeakMap();
    for(const method of ['fillText','strokeText']){const native=CanvasRenderingContext2D.prototype[method];CanvasRenderingContext2D.prototype[method]=function(text,x,y,...rest){
      const result=native.call(this,text,x,y,...rest);const m=this.measureText(String(text));const t=this.getTransform();
      const left=x-m.actualBoundingBoxLeft,right=x+m.actualBoundingBoxRight,top=y-m.actualBoundingBoxAscent,bottom=y+m.actualBoundingBoxDescent;
      const points=[[left,top],[right,top],[left,bottom],[right,bottom]].map(p=>({x:t.a*p[0]+t.c*p[1]+t.e,y:t.b*p[0]+t.d*p[1]+t.f}));
      const list=labels.get(this.canvas)||[];list.push({text:String(text),left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))});labels.set(this.canvas,list);return result;
    }}
    const pick=(e)=>{const canvas=e.target;if(!(canvas instanceof HTMLCanvasElement))return null;const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)*canvas.width/r.width,y=(e.clientY-r.top)*canvas.height/r.height;return (labels.get(canvas)||[]).slice().reverse().find(l=>l.text.trim()&&x>=l.left-5&&x<=l.right+5&&y>=l.top-5&&y<=l.bottom+5)};
    document.addEventListener('mousemove',e=>{if(e.target instanceof HTMLCanvasElement)e.target.style.cursor=pick(e)?'text':'default'});
    document.addEventListener('click',e=>{const label=pick(e);if(label){parent.postMessage({type:'think-drawing-pick',text:label.text},'*');return;}if(e.target.matches&&e.target.matches('svg text, svg tspan'))parent.postMessage({type:'think-drawing-pick',text:e.target.textContent},'*')});
    function renderLabelTools(){const tools=document.getElementById('label-tools');tools.replaceChildren();const body=document.body.getBoundingClientRect();
      function add(text,left,top,width,height){if(!text.trim())return;const button=document.createElement('button');button.className='label-hotspot';button.setAttribute('aria-label','编辑图中文字 '+text);button.title='点击修改：'+text;Object.assign(button.style,{left:(left-3)+'px',top:(top-3)+'px',width:Math.max(width+6,10)+'px',height:Math.max(height+6,14)+'px'});button.onclick=()=>parent.postMessage({type:'think-drawing-pick',text},'*');tools.appendChild(button)}
      for(const canvas of container.querySelectorAll('canvas')){const r=canvas.getBoundingClientRect();for(const label of labels.get(canvas)||[])add(label.text,r.left-body.left+label.left*r.width/canvas.width,r.top-body.top+label.top*r.height/canvas.height,(label.right-label.left)*r.width/canvas.width,(label.bottom-label.top)*r.height/canvas.height)}
      for(const text of container.querySelectorAll('svg text')){const r=text.getBoundingClientRect();add(text.textContent||'',r.left-body.left,r.top-body.top,r.width,r.height)}
    }
    window.addEventListener('error',e=>report(e.error||e.message));window.addEventListener('unhandledrejection',e=>report(e.reason));
    window.addEventListener('message',async e=>{if(e.source!==parent||e.data?.type!=='think-drawing-capture')return;const {region,id}=e.data;
      try{const w=innerWidth,h=innerHeight;const image=document.createElement('canvas');image.width=Math.max(1,Math.round(w*region.width));image.height=Math.max(1,Math.round(h*region.height));const ctx=image.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,image.width,image.height);
        for(const canvas of container.querySelectorAll('canvas')){const r=canvas.getBoundingClientRect();ctx.drawImage(canvas,r.left-w*region.x,r.top-h*region.y,r.width,r.height)}
        for(const svg of container.querySelectorAll('svg')){const r=svg.getBoundingClientRect();const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');const source='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(clone));const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=source;});ctx.drawImage(img,r.left-w*region.x,r.top-h*region.y,r.width,r.height)}
        parent.postMessage({type:'think-drawing-capture-result',id,image:container.querySelector('canvas,svg')?image.toDataURL('image/png'):undefined},'*');
      }catch{parent.postMessage({type:'think-drawing-capture-result',id},'*');}
    });
    try{const code=data.functions.map(f=>f.func).join('\\n');const lookup=data.functions.map(f=>JSON.stringify(f.name)+':(typeof '+f.name+'===\"function\"?'+f.name+':null)').join(',');
    if(data.functions.some(f=>!/^[$A-Z_a-z][$\\w]*$/.test(f.name)))throw new Error('函数名称不是有效的 JavaScript 标识符');
    const registry=new Function(code+'\\nreturn {'+lookup+'};')();const draw=registry[data.name];if(typeof draw!=='function')throw new Error('未找到绘图函数 '+data.name);draw(container,()=>{},...data.params);
    new ResizeObserver(()=>{renderLabelTools();parent.postMessage({type:'think-drawing-height',height:container.scrollHeight},'*')}).observe(container);
    setTimeout(()=>{if(!failed&&!container.childElementCount)report('函数没有生成可视化内容')},1500);
    }catch(e){report(e)}<\/script></body></html>`;
  },[functions,step.func,step.func_params,step['question-index'],reload]);
  useEffect(()=>{
    setError('');
    function message(event:MessageEvent) {
      if(event.source!==frame.current?.contentWindow)return;
      if(event.data?.type==='think-drawing-error')setError(String(event.data.message));
      if(event.data?.type==='think-drawing-height')setHeight(Math.min(1000,Math.max(80,Number(event.data.height)||280)));
      if(event.data?.type==='think-drawing-pick'&&typeof event.data.text==='string')onPickLabel?.(event.data.text);
      if(event.data?.type==='think-drawing-capture-result'&&pending.current&&pending.current.id===event.data.id){const capture=pending.current;pending.current=null;clearTimeout(capture.timer);const image=typeof event.data.image==='string'&&event.data.image.startsWith('data:image/png;base64,')&&event.data.image.length<3_000_000?event.data.image:undefined;onRegion?.(capture.region,image);}
    }
    window.addEventListener('message',message);
    return ()=>{window.removeEventListener('message',message);if(pending.current)clearTimeout(pending.current.timer);pending.current=null;};
  },[source,onPickLabel,onRegion]);
  if(!target)return <div className="drawing-error"><AlertCircle size={16}/>未找到函数 {step.func}</div>;
  return <div className="drawing-preview">
    {error&&<div className="drawing-error"><AlertCircle size={16}/><span>{error}</span><button className="icon-button" title="重新渲染绘图" onClick={()=>setReload(v=>v+1)}><RefreshCw size={14}/></button></div>}
    <iframe ref={frame} title={`绘图预览 ${step.func}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={source} style={{height:error?0:height}}/>
    {aiMode&&!error&&<div className="drawing-select-overlay" aria-label="拖动框选图形区域" onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect();const point={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};drag.current=point;setBox({...point,endX:point.x,endY:point.y});e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drag.current)return;const r=e.currentTarget.getBoundingClientRect();setBox({...drag.current,endX:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),endY:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))});}} onPointerCancel={()=>{drag.current=null;setBox(null);}} onPointerUp={e=>{if(!drag.current)return;const r=e.currentTarget.getBoundingClientRect();const endX=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),endY=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));const region={x:Math.min(drag.current.x,endX),y:Math.min(drag.current.y,endY),width:Math.abs(drag.current.x-endX),height:Math.abs(drag.current.y-endY)};drag.current=null;if(region.width*r.width<5||region.height*r.height<5){setBox(null);return;}if(pending.current)clearTimeout(pending.current.timer);const id=crypto.randomUUID();const timer=setTimeout(()=>{if(pending.current?.id===id){pending.current=null;onRegion?.(region);}},2000);pending.current={id,region,timer};frame.current?.contentWindow?.postMessage({type:'think-drawing-capture',region,id},'*');}}>{box&&<div className="drawing-selection-box" style={{left:`${Math.min(box.x,box.endX)*100}%`,top:`${Math.min(box.y,box.endY)*100}%`,width:`${Math.abs(box.endX-box.x)*100}%`,height:`${Math.abs(box.endY-box.y)*100}%`}}/>}</div>}
  </div>;
}

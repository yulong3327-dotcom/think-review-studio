import type { IncomingMessage,ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export const AI_UPSTREAM='https://ccproxy.yukework.com/v1/chat/completions';
export function allowedLocalRequest(host:string|undefined,origin:string|undefined) {
  if(!host||!/^((localhost|127\.0\.0\.1)(:\d+)?|\[::1\](:\d+)?)$/.test(host))return false;
  if(!origin)return false;
  try{const url=new URL(origin);return url.protocol==='http:'&&url.host===host;}catch{return false;}
}
async function proxy(req:IncomingMessage,res:ServerResponse,next:()=>void) {
  if(req.url!=='/api/ai/chat/completions'){next();return;}
  const reply=(status:number,message:string)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:message}));};
  if(!allowedLocalRequest(req.headers.host,req.headers.origin)){reply(403,'仅允许本地网站调用');return;}
  if(req.method!=='POST'){reply(405,'仅支持 POST');return;}
  if(!req.headers.authorization?.startsWith('Bearer ')||req.headers.authorization.length>300){reply(401,'请配置 API 密钥');return;}
  try{
    let size=0;const chunks:Buffer[]=[];
    for await(const chunk of req){size+=chunk.length;if(size>4_000_000){reply(413,'请求内容过大');return;}chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(typeof body.model!=='string'||!Array.isArray(body.messages)){reply(400,'请求结构无效');return;}
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),180_000);
    const closed=()=>controller.abort();res.on('close',closed);
    try{
      const upstream=await fetch(AI_UPSTREAM,{method:'POST',headers:{'Content-Type':'application/json',Authorization:req.headers.authorization},body:JSON.stringify({model:body.model,messages:body.messages,stream:false,max_completion_tokens:16000}),signal:controller.signal});
      if(!upstream.ok){reply(upstream.status,'AI 服务返回错误');return;}
      const output=await upstream.json();res.statusCode=200;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(output));
    }finally{clearTimeout(timer);res.off('close',closed);}
  }catch(error){if(!res.destroyed)reply(error instanceof Error&&error.name==='AbortError'?504:502,'AI 连接失败，请稍后重试');}
}
export function localAiProxy():Plugin {return {name:'local-ai-proxy',configureServer(server){server.middlewares.use(proxy);},configurePreviewServer(server){server.middlewares.use(proxy);}};}

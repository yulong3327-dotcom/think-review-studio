import { afterEach,describe,it,expect,vi } from 'vitest';
import { aiEndpoint,buildAiMessages,parseAiProposal,requestAi,sameData } from './ai';
import { allowedLocalRequest } from '../../scripts/ai-proxy';
import type { ThinkData } from '../types';
const original:ThinkData={custom:{keep:true},steps:[{content:'长度 2m',narration:'原始旁白',extra:'保留'}],func_list:[{name:'draw',func:'function draw(container,cb) { cb(); }',extra:3}]};
afterEach(()=>vi.unstubAllGlobals());
describe('浏览器 AI 请求',()=>{
  it('线上发送至指定接口并校验返回修改',async()=>{
    vi.stubGlobal('location',{hostname:'yulong3327-dotcom.github.io'});
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({changes:[{path:'/steps/0/content',value:'长度 2cm'}]})}}]}),{status:200,headers:{'Content-Type':'application/json'}}));
    vi.stubGlobal('fetch',fetchMock);
    const result=await requestAi(original,{stepIndex:0,kind:'content'},'修改单位',{apiKey:'test-key',model:'gpt-6-sol'},new AbortController().signal);
    expect(fetchMock.mock.calls[0][0]).toBe('https://ccproxy.yukework.com/v1/chat/completions');expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');expect(result.data.steps[0].content).toBe('长度 2cm');expect(original.steps[0].content).toBe('长度 2m');
  });
  it('网络失败时说明跨域要求，取消时保留取消信号',async()=>{
    vi.stubGlobal('location',{hostname:'yulong3327-dotcom.github.io'});vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(requestAi(original,{stepIndex:0,kind:'content'},'修改',{apiKey:'test-key',model:'gpt-6-sol'},new AbortController().signal)).rejects.toThrow('CORS');
    const controller=new AbortController();controller.abort();vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new DOMException('aborted','AbortError')));
    await expect(requestAi(original,{stepIndex:0,kind:'content'},'修改',{apiKey:'test-key',model:'gpt-6-sol'},controller.signal)).rejects.toMatchObject({name:'AbortError'});
  });
});
describe('AI 修改校验',()=>{
  it('应用字段修改，保留其他数据且不修改原始对象',()=>{const result=parseAiProposal('```json\n'+JSON.stringify({summary:'修改单位',changes:[{path:'/steps/0/content',value:'长度 2cm'}]})+'\n```',original);expect(result.data.steps[0].content).toBe('长度 2cm');expect(result.data.custom).toEqual({keep:true});expect(result.data.steps[0].extra).toBe('保留');expect(result.data.func_list).toEqual(original.func_list);expect(original.steps[0].content).toBe('长度 2m');expect(sameData(original,result.data)).toBe(false);});
  it.each(['/__proto__/polluted','/steps/0/extra','/steps/0','/func_list/0/name','/steps/99/content'])('拒绝非法字段 %s',path=>{expect(()=>parseAiProposal(JSON.stringify({changes:[{path,value:'x'}]}),original)).toThrow();});
  it('拒绝重复路径、错误类型、空结果及坏代码',()=>{for(const changes of [[{path:'/steps/0/content',value:5}],[{path:'/steps/0/content',value:'长度 2m'}],[{path:'/func_list/0/func',value:'function ('}],[{path:'/steps/0/content',value:'x'},{path:'/steps/0/content',value:'y'}],[]])expect(()=>parseAiProposal(JSON.stringify({changes}),original)).toThrow();});
  it('拒绝不存在的函数引用',()=>{expect(()=>parseAiProposal(JSON.stringify({changes:[{path:'/steps/0/func',value:'missing'}]}),original)).toThrow();});
  it('绘图修改必须保留可调用的函数名称',()=>{expect(()=>parseAiProposal(JSON.stringify({changes:[{path:'/func_list/0/func',value:'function other(container,cb) { cb(); }'}]}),original)).toThrow('未保留函数');expect(parseAiProposal(JSON.stringify({changes:[{path:'/func_list/0/func',value:'function draw(container,cb) { container.textContent="新图"; cb(); }'}]}),original).data.func_list?.[0].extra).toBe(3);});
  it('图片与选中区域进入模型上下文',()=>{const messages=buildAiMessages(original,{stepIndex:0,kind:'drawing',region:{x:0,y:0,width:0.5,height:0.5},image:'data:image/png;base64,abc'},'修复图形');expect(messages[1].content).toEqual(expect.arrayContaining([expect.objectContaining({type:'image_url'})]));});
});
describe('本地代理限制',()=>{
  it('线上直接调用指定服务，本地调用同源代理',()=>{expect(aiEndpoint('yulong3327-dotcom.github.io')).toBe('https://ccproxy.yukework.com/v1/chat/completions');expect(aiEndpoint('127.0.0.1')).toBe('/api/ai/chat/completions');});
  it('允许同源本地请求',()=>expect(allowedLocalRequest('127.0.0.1:5173','http://127.0.0.1:5173')).toBe(true));
  it.each([['evil.com','https://evil.com'],['localhost:5173','https://evil.com'],['localhost:5173','http://localhost:9999'],['localhost:5173',undefined],['localhost.evil.com','http://localhost.evil.com']])('拒绝非本地同源请求', (host,origin)=>expect(allowedLocalRequest(host,origin)).toBe(false));
});

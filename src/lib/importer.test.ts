import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import samples from '../data/samples.json';
import { parseThinkText, validateThink } from './importer';
import type { ThinkData } from '../types';

const example:ThinkData = {steps:[{'question-index':1,type:'分步讲解',content:'公式 $\\frac{U^2}{R}$ 与引号 "文本"',narration:'保留\\反斜杠',func:'draw',func_params:[2]}],func_list:[{name:'draw',func:'function draw(container, cb, step) { const label = "{}"; cb(); }'}],extra:{preserve:true}};
describe('Think batch parser',()=>{
  it('imports the complete supplied reference file without altering drawing code',()=>{
    const raw=readFileSync('examples/think-表格文本.txt','utf8');
    const result=parseThinkText(raw);
    expect(result.errors).toEqual([]);
    expect(result.documents).toEqual(samples);
    expect(result.documents).toHaveLength(26);
  });
  it('preserves all custom fields through parse/edit/export round trips',()=>{
    const result=parseThinkText(JSON.stringify(example));
    result.documents[0].steps[0].content='修改后的公式 $U^2$';
    const output=parseThinkText(JSON.stringify(result.documents));
    expect(output.documents[0].extra).toEqual({preserve:true});
    expect(output.documents[0].func_list).toEqual(example.func_list);
    expect(output.documents[0].steps[0].content).toBe('修改后的公式 $U^2$');
  });
  it('supports multiple fenced documents, including braces within JS strings',()=>{
    const raw=`说明\n\`\`\`json\n${JSON.stringify(example,null,2)}\n\`\`\`\n\`\`\`json\n${JSON.stringify(example)}\n\`\`\``;
    expect(parseThinkText(raw)).toEqual({documents:[example,example],errors:[]});
  });
  it('supports JSONL and doubly encoded JSON',()=>{
    expect(parseThinkText([JSON.stringify(example),JSON.stringify(example)].join('\n')).documents).toEqual([example,example]);
    expect(parseThinkText(JSON.stringify(JSON.stringify(example))).documents).toEqual([example]);
  });
  it('supports spreadsheet-style doubled quotes, nested escaped JS quotes and CSV cells',()=>{
    const text=JSON.stringify(example).replace(/"/g,'""');
    expect(parseThinkText(`标题,json\n"题目一","${text}"\n"题目二","${text}"`)).toEqual({documents:[example,example],errors:[]});
  });
  it('reports malformed entries while preserving valid entries',()=>{
    const result=parseThinkText(`${JSON.stringify(example)}\n{"steps": [bad]}`);
    expect(result.documents).toEqual([example]);expect(result.errors).toHaveLength(1);
    expect(parseThinkText('{"steps": [').errors[0]).toContain('未闭合');
  });
  it('supports wrapper objects and rejects unrelated JSON',()=>{
    expect(parseThinkText(JSON.stringify({results:[example]})).documents).toEqual([example]);
    expect(parseThinkText('{"other":123}').documents).toEqual([]);
    expect(parseThinkText('')).toEqual({documents:[],errors:['内容为空，请选择文件或粘贴 JSON。']});
  });
});
describe('Think validation',()=>{
  it('accepts all provided reference documents',()=>{
    for(const sample of samples)expect(validateThink(sample as ThinkData)).toEqual([]);
  });
  it('checks references against question indices and validates params',()=>{
    expect(validateThink({...example,func_list:[{name:'draw',func:'', 'question-index':2}]}).join(' ')).toContain('不存在');
    expect(validateThink({steps:[{content:'',func_params:{} as unknown as unknown[]}]}).join(' ')).toContain('func_params');
  });
  it('rejects malformed steps and function arrays without crashing',()=>{
    expect(validateThink({steps:[]})).toHaveLength(1);
    expect(validateThink({steps:[null] as unknown as ThinkData['steps']})).toHaveLength(1);
    expect(validateThink({steps:[{content:'ok'}],func_list:{} as ThinkData['func_list']})).toHaveLength(1);
  });
});

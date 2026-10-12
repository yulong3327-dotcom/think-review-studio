import { describe, expect, it } from 'vitest';
import { replaceDrawingLabel } from './drawing-edit';
import samples from '../data/samples.json';
import { parse } from 'acorn';

describe('Canvas label edits write back to JavaScript',()=>{
  it('modifies exact string tokens and leaves code, comments and other labels alone',()=>{
    const code=`function draw() { /* "18 厘米" */ const text = "18 厘米"; const other = '118 厘米'; ctx.fillText('18 厘米', 1, 2); }`;
    const result=replaceDrawingLabel(code,'18 厘米','19 "厘米"');
    expect(result.count).toBe(2);
    expect(result.code).toContain('/* "18 厘米" */');
    expect(result.code).toContain("'118 厘米'");
    expect(()=>parse(result.code,{ecmaVersion:'latest'})).not.toThrow();
  });
  it('writes a real reference diagram label back without changing other fields',()=>{
    const code=samples[0].func_list[0].func;
    const result=replaceDrawingLabel(code,'18 厘米','约 18 cm');
    expect(result.count).toBe(2);
    expect(result.code).not.toContain('18 厘米');
    expect(result.code).toContain('约 18 cm');
    expect(()=>parse(result.code,{ecmaVersion:'latest'})).not.toThrow();
  });
  it('reports when a rendered label comes from an expression rather than a literal',()=>{
    const code='function draw() { ctx.fillText(value + " cm", 1, 2); }';
    expect(replaceDrawingLabel(code,'18 cm','19 cm')).toEqual({code,count:0});
  });
});

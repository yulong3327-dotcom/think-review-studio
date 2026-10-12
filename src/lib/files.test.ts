import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildZip } from './files';
import { makeDocument } from './storage';
import type { ThinkData } from '../types';

it('exports edited documents in independent JSON files with opinions separated',async()=>{
  const original:ThinkData={steps:[{content:'原始讲解',narration:'旁白'}],func_list:[],unknownField:{keep:'保留'}};
  const doc=makeDocument(original,'题目/一','数据.json');
  doc.data.steps[0].content='已修改的讲解 $U^2$';doc.status='approved';doc.note='改了公式';
  const blob=await buildZip([doc],true);
  const archive=await JSZip.loadAsync(await blob.arrayBuffer());
  const data=JSON.parse(await archive.file('001_题目_一.json')!.async('string'));
  expect(data.steps[0].content).toBe('已修改的讲解 $U^2$');
  expect(data.unknownField).toEqual({keep:'保留'});
  expect(data).not.toHaveProperty('note');expect(data).not.toHaveProperty('status');
  const report=JSON.parse(await archive.file('审核意见.json')!.async('string'));
  expect(report[0]).toMatchObject({status:'approved',note:'改了公式',modified:true});
});

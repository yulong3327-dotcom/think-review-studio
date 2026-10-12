import JSZip from 'jszip';
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import { parseThinkText, validateThink } from './importer';
import { makeDocument } from './storage';
import { validateTableHeaders } from './dingtalk';
import { prepareTableFile, readTableFile } from './table-files';
import type { ImportProblem, ReviewDocument } from '../types';

export async function importFiles(files: File[]): Promise<{ documents: ReviewDocument[]; problems: ImportProblem[] }> {
  const documents: ReviewDocument[] = [], problems: ImportProblem[] = [];
  async function consume(text: string, source: string, label?: string) {
    const result = parseThinkText(text);
    problems.push(...result.errors.map(message => ({ source, message })));
    result.documents.forEach((data, i) => {
      const errors = validateThink(data);
      if (errors.some(error => /必须是|至少需要|缺少/.test(error))) {
        problems.push({source, message: `第 ${i + 1} 条数据结构无效：${errors.join('；')}`});
        return;
      }
      documents.push(makeDocument(data, label || `${source.replace(/\.[^.]+$/, '')}${result.documents.length > 1 ? ` · ${String(i + 1).padStart(2, '0')}` : ''}`, source));
    });
  }
  for (const file of files) {
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const sheets = await readSheetNames(file);
        if(sheets.includes('练习')) {
          const rows=await readTableFile({id:'',name:file.name,bytes:await file.arrayBuffer()});
          let matches=false;try{validateTableHeaders(rows[0]||[]);matches=true;}catch{/* Generic spreadsheet. */}
          if(matches){const result=await prepareTableFile(file);documents.push(...result.documents);problems.push(...result.problems);continue;}
        }
        for (const sheet of sheets) {
          const rows = await readXlsxFile(file, {sheet});
          let candidates = 0;
          for (const [rowIndex, row] of rows.entries()) {
            for (const cell of row) {
              if (typeof cell === 'string' && /"{1,2}steps"{1,2}\s*:/.test(cell)) {
                candidates++;
                const label = row.find(value => typeof value === 'string' && value !== cell && value.length < 100);
                await consume(cell, `${file.name} / ${sheet} / 第 ${rowIndex + 1} 行`, typeof label === 'string' ? label : undefined);
              }
            }
          }
          if (!candidates) problems.push({ source: `${file.name} / ${sheet}`, message: '没有找到包含 Think JSON 的单元格。请将每条 JSON 放在一个单元格内。' });
        }
      } else if (/\.zip$/i.test(file.name)) {
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files).filter(entry => !entry.dir && /\.(json|jsonl|txt|csv)$/i.test(entry.name));
        if (!entries.length) problems.push({source:file.name,message:'压缩包内没有 JSON、JSONL、TXT 或 CSV 文件。'});
        for (const entry of entries) await consume(await entry.async('string'), `${file.name}/${entry.name}`);
      } else if (/\.(json|jsonl|txt|csv|tsv)$/i.test(file.name)) {
        const text=await file.text();
        if(/\.(csv|tsv)$/i.test(file.name)) {
          const rows=await readTableFile({id:'',name:file.name,bytes:await file.arrayBuffer()});
          let matches=false;try{validateTableHeaders(rows[0]||[]);matches=true;}catch{/* Generic spreadsheet. */}
          if(matches){const result=await prepareTableFile(file);documents.push(...result.documents);problems.push(...result.problems);continue;}
          if(rows[0]?.some(cell=>/最终-think结果|1v1.*think.*参考/i.test(cell)))throw new Error('检测到练习表，但表头位置不匹配。请从「钉钉表格任务」导入完整「练习」分表。');
          let candidates=0;
          for(const [i,row] of rows.entries())for(const cell of row)if(/"{1,2}steps"{1,2}\s*:/.test(cell)){candidates++;await consume(cell,`${file.name} / 第 ${i+1} 行`);}
          if(!candidates)await consume(text,file.name);
        }else await consume(text, file.name);
      } else problems.push({source:file.name,message:'暂不支持该格式。支持 JSON、JSONL、TXT、CSV、XLSX 和 ZIP。'});
    } catch (error) { problems.push({source:file.name,message:(error as Error).message}); }
  }
  return { documents, problems };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function safeName(name: string) { return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120) || 'think'; }
export function downloadJson(value: unknown, name: string) {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json;charset=utf-8'}), `${safeName(name)}.json`);
}
export async function buildZip(documents: ReviewDocument[], includeReport: boolean) {
  const zip = new JSZip();
  documents.forEach((doc, i) => zip.file(`${String(i + 1).padStart(3,'0')}_${safeName(doc.name)}.json`, JSON.stringify(doc.data, null, 2)));
  if (includeReport) zip.file('审核意见.json', JSON.stringify(documents.map(doc => ({name:doc.name,source:doc.source,status:doc.status,note:doc.note,modified:JSON.stringify(doc.data)!==JSON.stringify(doc.original),modifiedAt:doc.modifiedAt})), null, 2));
  return zip.generateAsync({type:'blob',compression:'DEFLATE'});
}
export async function exportZip(documents: ReviewDocument[], includeReport: boolean) {
  downloadBlob(await buildZip(documents,includeReport), `Think_审核结果_${new Date().toISOString().slice(0,10)}.zip`);
}

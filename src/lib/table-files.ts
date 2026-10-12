import JSZip from 'jszip';
import { DING_SHEET, importTableRows, parseTableText, rowConflict, serializeTable, tableDelimiter, tableWrite, validateTableHeaders } from './dingtalk';
import { saveTableFile } from './storage';
import type { TableFile } from './storage';
import type { ReviewDocument } from '../types';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const elements = (parent: Document | Element, name: string) => Array.from(parent.getElementsByTagNameNS('*', name));
function xml(raw: string) {
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (elements(doc, 'parsererror').length) throw new Error('Excel 工作表 XML 无法解析，请重新下载或改用 CSV。');
  return doc;
}
async function xlsxSheet(bytes: ArrayBuffer) {
  const zip = await JSZip.loadAsync(bytes);
  async function read(path: string) { const entry = zip.file(path); if (!entry) throw new Error('Excel 文件缺少工作表，请重新下载。'); return xml(await entry.async('string')); }
  const workbook = await read('xl/workbook.xml'), rels = await read('xl/_rels/workbook.xml.rels');
  const sheet = elements(workbook, 'sheet').find(el => el.getAttribute('name') === DING_SHEET);
  if (!sheet) throw new Error('Excel 中未找到「练习」分表，请下载完整工作簿或该分表的 CSV。');
  const id = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rel = elements(rels, 'Relationship').find(el => el.getAttribute('Id') === id);
  if (!rel || rel.getAttribute('TargetMode') === 'External') throw new Error('无法定位「练习」分表。');
  const target = rel.getAttribute('Target') || '';
  const parts: string[] = [];
  for (const p of (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/')) { if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p); }
  const path = parts.join('/'), doc = await read(path);
  const shared = zip.file('xl/sharedStrings.xml');
  const strings = shared ? elements(xml(await shared.async('string')), 'si').map(el => elements(el, 't').map(t => t.textContent || '').join('')) : [];
  const rows: string[][] = [];
  for (const row of elements(doc, 'row')) {
    const rowIndex = Number(row.getAttribute('r')) - 1;
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > 1000000) throw new Error('Excel 行号无效。');
    while (rows.length <= rowIndex) rows.push([]);
    for (const cell of elements(row, 'c')) {
      const column = (cell.getAttribute('r') || '').match(/^[A-Z]+/)?.[0]; if (!column) continue;
      let col = 0; for (const letter of column) col = col * 26 + letter.charCodeAt(0) - 64;
      const value = elements(cell, 'v')[0]?.textContent || '', type = cell.getAttribute('t');
      rows[rowIndex][col - 1] = type === 's' ? strings[Number(value)] || '' : type === 'inlineStr' ? elements(cell, 't').map(t => t.textContent || '').join('') : value;
    }
  }
  return { zip, path, doc, rows };
}

export async function readTableFile(file: TableFile) {
  if (/\.xlsx$/i.test(file.name)) return (await xlsxSheet(file.bytes)).rows;
  if (!/\.(csv|tsv)$/i.test(file.name)) throw new Error('请选择下载的 CSV、TSV 或 XLSX 表格。');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); }
  catch { text = new TextDecoder('gb18030').decode(file.bytes); }
  return parseTableText(text, /\.tsv$/i.test(file.name) ? '\t' : tableDelimiter(text));
}

export async function prepareTableFile(file: File, preferFinal = false) {
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, '0')).join('');
  const original = { id, name: file.name, bytes };
  const rows = await readTableFile(original);
  validateTableHeaders(rows[0] || []);
  const result = importTableRows(rows.slice(1), 2, preferFinal);
  for (const doc of result.documents) {
    doc.tableBinding = { ...doc.tableBinding!, fileId: id, fileName: file.name };
    doc.source = `${file.name} / 练习 / P${doc.tableBinding.row} → S${doc.tableBinding.row}`;
  }
  if (result.documents.length) {
    try { await saveTableFile(original); }
    catch { throw new Error('浏览器未能保存原表。请释放浏览器存储空间后重试，确保审核后可以导出完整表格。'); }
  }
  return { ...result, rowCount: rows.length - 1, fileName: file.name };
}

export async function buildReviewedTable(file: TableFile, documents: ReviewDocument[]) {
  if (!documents.length) throw new Error('请先选择已审核通过的任务。');
  if (documents.some(doc => doc.tableBinding?.fileId !== file.id)) throw new Error('所选任务来自不同的原表，请按导入文件分别导出。');
  const excel = /\.xlsx$/i.test(file.name) ? await xlsxSheet(file.bytes) : undefined;
  const rows = excel?.rows || await readTableFile(file);
  validateTableHeaders(rows[0] || []);
  const seen = new Set<number>();
  const writes = documents.map(tableWrite);
  for (const write of writes) {
    if (seen.has(write.row)) throw new Error(`S${write.row} 有重复任务，请核对后导出。`);
    seen.add(write.row);
    const conflict = rowConflict(write, rows[write.row - 1] || []);
    if (conflict) throw new Error(`S${write.row}：${conflict}`);
  }
  if (excel) {
    for (const write of writes) {
      const value = JSON.stringify(write.data), address = `S${write.row}`;
      if (value.length > 32767) throw new Error(`${address} 的 JSON 超过 Excel 单元格长度上限，请导出「S 列结果 CSV」或用 CSV 原表导入。`);
      for (const merged of elements(excel.doc, 'mergeCell')) {
        const range = (merged.getAttribute('ref') || '').match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
        const col = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
        if (range && col(range[1]) <= 19 && col(range[3]) >= 19 && Number(range[2]) <= write.row && Number(range[4]) >= write.row)
          throw new Error(`${address} 属于合并单元格，请改用 CSV。`);
      }
      const row = elements(excel.doc, 'row').find(el => el.getAttribute('r') === String(write.row));
      if (!row) throw new Error(`${address} 原行不存在。`);
      let cell = elements(row, 'c').find(el => el.getAttribute('r') === address);
      if (!cell) {
        cell = excel.doc.createElementNS(NS, 'c'); cell.setAttribute('r', address);
        const later = elements(row, 'c').find(el => { const c = (el.getAttribute('r') || '').match(/^[A-Z]+/)?.[0]; return c && (c.length > 1 || c > 'S'); });
        row.insertBefore(cell, later || null);
      }
      if (elements(cell, 'f').length) throw new Error(`${address} 包含公式，请先在原表确认该列可填写 JSON。`);
      while (cell.firstChild) cell.removeChild(cell.firstChild);
      cell.setAttribute('t', 'inlineStr');
      const inline = excel.doc.createElementNS(NS, 'is'), text = excel.doc.createElementNS(NS, 't');
      text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); text.textContent = value;
      inline.appendChild(text); cell.appendChild(inline);
    }
    excel.zip.file(excel.path, new XMLSerializer().serializeToString(excel.doc));
    return { bytes: await excel.zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' }), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' };
  }
  for (const write of writes) {
    const row = rows[write.row - 1]; while (row.length < 19) row.push('');
    row[18] = JSON.stringify(write.data);
  }
  const delimiter = /\.tsv$/i.test(file.name) ? '\t' : ',';
  return { bytes: new TextEncoder().encode(serializeTable(rows, delimiter)).buffer, type: 'text/plain;charset=utf-8', extension: delimiter === '\t' ? 'tsv' : 'csv' };
}

export function resultsCsv(documents: ReviewDocument[]) {
  const writes = documents.map(doc => ({ ...tableWrite(doc), teacher: doc.tableBinding!.scriptTeacher })).sort((a, b) => a.row - b.row);
  return serializeTable([['原表行号', 'tid', '脚本老师', '最终-think结果'], ...writes.map(w => [String(w.row), w.tid, w.teacher, JSON.stringify(w.data)])]);
}

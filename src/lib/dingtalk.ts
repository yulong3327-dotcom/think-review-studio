import { parseThinkText, validateThink } from './importer';
import { makeDocument } from './storage';
import type { ImportProblem, ReviewDocument, ThinkData } from '../types';

export const DING_WORKBOOK = 'dQPGYqjpJYg0Xb5xIBgyzZO2Wakx1Z5N';
export const DING_URL = `https://alidocs.dingtalk.com/i/nodes/${DING_WORKBOOK}`;
export const DING_SHEET = '练习';
export const DING_HEADERS = { tid: 'tid', reference: '1V1-think跑出结果（参考）', final: '最终-think结果' };
export const UNASSIGNED_TEACHER = '__unassigned__';
export function matchesTeacher(doc: ReviewDocument, teacher: string) {
  return !teacher || (teacher === UNASSIGNED_TEACHER ? !!doc.tableBinding && !doc.tableBinding.scriptTeacher : doc.tableBinding?.scriptTeacher === teacher);
}

// Spreadsheet clipboard text quotes multiline cells and doubles embedded quotes.
export function tableDelimiter(raw: string): ',' | '\t' {
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '"') { if (quoted && raw[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted) {
      if (raw[i] === '\t') return '\t';
      if (raw[i] === ',') return ',';
      if (raw[i] === '\r' || raw[i] === '\n') break;
    }
  }
  return '\t';
}
export function parseTableText(raw: string, delimiter = tableDelimiter(raw)): string[][] {
  const text = raw.replace(/^\uFEFF/, '');
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('表格文本的单元格引号未闭合，请重新复制完整区域。');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function serializeTable(rows: string[][], delimiter = ','): string {
  return '\uFEFF' + rows.map(row => row.map(cell => {
    const value = String(cell ?? '');
    return value.includes(delimiter) || /["\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(delimiter)).join('\r\n') + '\r\n';
}

export function validateTableHeaders(header: unknown[]) {
  if (String(header[5] ?? '').trim().toLowerCase() !== 'tid'
    || String(header[13] ?? '').trim() !== '脚本老师'
    || !/1v1.*think.*参考/i.test(String(header[15] ?? ''))
    || String(header[18] ?? '').trim() !== DING_HEADERS.final)
    throw new Error('表头不匹配：需要 F 列 tid、N 列脚本老师、P 列参考 Think JSON、S 列最终-think结果。请选择「练习」完整工作表，或从 A 列开始复制。');
}

export function importTableRows(rows: unknown[][], startRow: number, preferFinal = false) {
  if (!Number.isInteger(startRow) || startRow < 2) throw new Error('数据起始行须为 2 或更大。');
  const documents: ReviewDocument[] = [], problems: ImportProblem[] = [];
  rows.forEach((cells, i) => {
    const row = startRow + i, referenceRaw = String(cells[15] ?? ''), finalRaw = String(cells[18] ?? '');
    const raw = preferFinal && finalRaw.trim() ? finalRaw : referenceRaw;
    if (!raw.trim()) return;
    const source = `钉钉 / ${DING_SHEET} / P${row} → S${row}`;
    const result = parseThinkText(raw);
    if (result.errors.length || result.documents.length !== 1) {
      problems.push({ source, message: result.errors.join('；') || '每个单元格需要包含一份完整的 Think JSON。' }); return;
    }
    const data = result.documents[0], issues = validateThink(data);
    if (issues.length) { problems.push({ source, message: issues.join('；') }); return; }
    const tid = String(cells[5] ?? '').trim();
    if (!tid) { problems.push({ source, message: '缺少 tid，无法确定回填题目。' }); return; }
    const title = String(cells[4] ?? '').trim() || `题目 ${tid}`;
    const doc = makeDocument(data, `${title} · ${tid}`, source);
    doc.tableBinding = { workbookId: DING_WORKBOOK, sheet: DING_SHEET, row, tid, scriptTeacher: String(cells[13] ?? '').trim(), referenceRaw, finalRaw };
    documents.push(doc);
  });
  return { documents, problems };
}

export function importTableText(raw: string, startRow = 1, preferFinal = false) {
  const rows = parseTableText(raw);
  if (!rows.length) return { documents: [], problems: [] };
  if (startRow === 1) { validateTableHeaders(rows[0]); return importTableRows(rows.slice(1), 2, preferFinal); }
  return importTableRows(rows, startRow, preferFinal);
}

export interface TableWrite {
  row: number; tid: string; referenceRaw: string; finalRaw: string; data: ThinkData;
}
export function tableWrite(doc: ReviewDocument): TableWrite {
  const binding = doc.tableBinding;
  if (!binding || binding.workbookId !== DING_WORKBOOK || binding.sheet !== DING_SHEET) throw new Error('讲解未绑定当前钉钉表格。');
  if (doc.status !== 'approved') throw new Error(`S${binding.row} 尚未审核通过。`);
  const errors = validateThink(doc.data); if (errors.length) throw new Error(errors.join('；'));
  return { row: binding.row, tid: binding.tid, referenceRaw: binding.referenceRaw, finalRaw: binding.finalRaw, data: doc.data };
}

export function rowConflict(write: TableWrite, cells: unknown[]): string | undefined {
  if (String(cells[5] ?? '').trim() !== write.tid) return 'tid 已改变或行位置已移动，请重新导入。';
  if (String(cells[15] ?? '').trim() !== write.referenceRaw.trim()) return '参考 JSON 已更新，请重新导入。';
  if (String(cells[18] ?? '').trim() !== write.finalRaw.trim()) return 'S 列已有新的修改，请重新导入后核对。';
}

export function tableClipboard(documents: ReviewDocument[]) {
  const writes = documents.map(tableWrite).sort((a, b) => a.row - b.row);
  for (let i = 1; i < writes.length; i++) if (writes[i].row !== writes[i - 1].row + 1)
    throw new Error('所选行不连续，请逐行复制，避免覆盖中间未审核的题目。');
  return { address: writes.length ? `S${writes[0].row}:S${writes.at(-1)!.row}` : '', text: writes.map(w => JSON.stringify(w.data)).join('\n') };
}

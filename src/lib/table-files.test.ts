import { beforeAll, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { DING_HEADERS, importTableText, parseTableText, serializeTable } from './dingtalk';
import { buildReviewedTable, prepareTableFile, readTableFile, resultsCsv } from './table-files';
import { saveTableFile } from './storage';
import { importFiles } from './files';

vi.mock('./storage', async importOriginal => ({ ...await importOriginal<typeof import('./storage')>(), saveTableFile: vi.fn().mockResolvedValue(undefined) }));
beforeAll(() => { vi.stubGlobal('DOMParser', DOMParser); vi.stubGlobal('XMLSerializer', XMLSerializer); });
const header = Array(25).fill(''); header[5] = DING_HEADERS.tid; header[13] = '脚本老师'; header[15] = DING_HEADERS.reference; header[18] = DING_HEADERS.final; header[24] = '其他列';
const data = { steps: [{ 'question-index': 1, content: '中文,公式 $\\frac{1}{2}$\n"内容"' }, { 'question-index': 2, content: '整题保留' }], custom: { keep: '<&>' } };
function row(tid: string, teacher: string, final = '') { const r = Array(25).fill(''); r[4] = '估测'; r[5] = tid; r[13] = teacher; r[15] = JSON.stringify(data, null, 2); r[18] = final; r[24] = '后续列,不修改'; return r; }
const sourceRows = () => [header, row('00123', '老师甲', '原最终内容'), Array(25).fill(''), row('456', '老师乙', '其他老师的最终结果')];
const file = (rows = sourceRows()) => ({ id: 'source', name: '练习.csv', bytes: new TextEncoder().encode(serializeTable(rows)).buffer });
function docs() { const documents = importTableText(serializeTable(sourceRows())).documents; documents.forEach(d => { d.status = 'approved'; d.tableBinding!.fileId = 'source'; }); return documents; }

describe('下载表格的完整审核流程', () => {
  it('CSV 多行、引号、公式反斜杠、空行和尾列原样往返，一个单元格不拆题', () => {
    expect(parseTableText(serializeTable(sourceRows()))).toEqual(sourceRows());
    expect(importTableText(serializeTable(sourceRows())).documents).toHaveLength(2);
    expect(docs()[0].data.steps).toHaveLength(2);
  });
  it('导出整表仅改变选中老师的一行 S，保留其它列、空行和其它老师结果', async () => {
    const document = docs()[0]; document.data.steps[0].content = '修改后\n公式 $\\alpha$';
    const result = await buildReviewedTable(file(), [document]);
    const output = parseTableText(new TextDecoder().decode(result.bytes));
    const expected = sourceRows(); expected[1][18] = JSON.stringify(document.data);
    expect(output).toEqual(expected); expect(JSON.parse(output[1][18]).custom).toEqual({ keep: '<&>' });
    expect(JSON.parse(output[1][18])).not.toHaveProperty('status');
  });
  it('阻止未审核任务、重复目标行、不同原文件和行内容冲突', async () => {
    const document = docs()[0]; document.status = 'pending';
    await expect(buildReviewedTable(file(), [document])).rejects.toThrow('尚未审核通过'); document.status = 'approved';
    await expect(buildReviewedTable(file(), [document, document])).rejects.toThrow('重复');
    await expect(buildReviewedTable({ ...file(), id: 'other' }, [document])).rejects.toThrow('不同');
    const rows = sourceRows(); rows[1][18] = '已被他人修改';
    await expect(buildReviewedTable(file(rows), [document])).rejects.toThrow('S 列');
  });
  it('导入时关联并保存原文件，重复下载内容生成相同身份', async () => {
    const input = new File([file().bytes], '练习.csv');
    const first = await prepareTableFile(input), second = await prepareTableFile(input);
    expect(first.rowCount).toBe(3); expect(first.documents[0].tableBinding?.fileId).toBe(second.documents[0].tableBinding?.fileId);
    expect(saveTableFile).toHaveBeenCalledWith(expect.objectContaining({ name: '练习.csv', bytes: file().bytes }));
    vi.mocked(saveTableFile).mockRejectedValueOnce(new Error('quota'));
    await expect(prepareTableFile(input)).rejects.toThrow('未能保存原表');
  });
  it('结果 CSV 按行号包含 tid、老师和完整最终 JSON，方便汇总', () => {
    const rows = parseTableText(resultsCsv(docs().reverse()));
    expect(rows[1].slice(0,3)).toEqual(['2', '00123', '老师甲']); expect(rows[2][0]).toBe('4');
    expect(JSON.parse(rows[1][3])).toEqual(data);
  });
  it('普通批量文件入口自动识别练习表，不把 P 和 S 当作两条题目', async () => {
    const rows=sourceRows(); rows[1][18]=JSON.stringify({steps:[{content:'旧最终结果'}]});
    const result=await importFiles([new File([serializeTable(rows)],'练习.csv')]);
    expect(result.problems).toEqual([]); expect(result.documents).toHaveLength(2);
    expect(result.documents[0].tableBinding).toMatchObject({row:2,scriptTeacher:'老师甲',fileName:'练习.csv'});
    expect(result.documents[0].data).toEqual(data);
  });
  it('普通 CSV 的 JSON 单元格仍可批量导入', async () => {
    const result=await importFiles([new File([serializeTable([['标题','JSON'],['一',JSON.stringify(data)],['二',JSON.stringify(data)]])],'普通.csv')]);
    expect(result.documents).toHaveLength(2);expect(result.problems).toEqual([]);
  });
});

async function excelFile() {
  const zip = new JSZip(), esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const cell = (address: string, value: string) => `<c r="${address}" t="inlineStr" s="4"><is><t>${esc(value)}</t></is></c>`;
  zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="练习" sheetId="1" r:id="rId1"/><sheet name="大纲" sheetId="2" r:id="rId2"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cell('F1',header[5])}${cell('N1',header[13])}${cell('P1',header[15])}${cell('S1',header[18])}</row><row r="4">${cell('F4','00123')}${cell('N4','老师甲')}${cell('P4',JSON.stringify(data))}${cell('S4','原结果')}<c r="T4"><f>SUM(A4:B4)</f><v>2</v></c></row></sheetData></worksheet>`);
  zip.file('xl/worksheets/sheet2.xml', '其他分表必须保留'); zip.file('xl/styles.xml', '原始样式'); zip.file('xl/media/image1.png', new Uint8Array([1,2,3]));
  return { id: 'excel', name: '完整表.xlsx', bytes: await zip.generateAsync({ type:'arraybuffer' }) };
}
describe('XLSX 保留原工作簿', () => {
  it('按真实行号导入，更新 S 单元格且保留样式、公式和全部其它压缩条目', async () => {
    const original = await excelFile(), rows = await readTableFile(original);
    expect(rows).toHaveLength(4); expect(rows[1]).toEqual([]); expect(rows[3][5]).toBe('00123');
    const document = importTableText(serializeTable(rows.map(r => Array.from(r, c => c || '')))).documents[0];
    document.status = 'approved'; document.tableBinding!.fileId = 'excel'; document.data.steps[0].content = '修改 <&> 中文';
    const result = await buildReviewedTable(original, [document]);
    expect((await readTableFile({ ...original, bytes:result.bytes }))[3][18]).toBe(JSON.stringify(document.data));
    const before = await JSZip.loadAsync(original.bytes), after = await JSZip.loadAsync(result.bytes);
    expect(Object.keys(after.files)).toEqual(Object.keys(before.files));
    for (const name of Object.keys(before.files)) if(name !== 'xl/worksheets/sheet1.xml')expect(await after.files[name].async('uint8array')).toEqual(await before.files[name].async('uint8array'));
    const output = await after.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(output).toContain('s="4"'); expect(output).toContain('<f>SUM(A4:B4)</f>');
    document.data.steps[0].content = '长'.repeat(33000);
    await expect(buildReviewedTable(original,[document])).rejects.toThrow('单元格长度上限');
  });
});

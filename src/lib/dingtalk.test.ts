import { describe, expect, it } from 'vitest';
import { DING_HEADERS, importTableText, parseTableText, rowConflict, tableClipboard, tableWrite } from './dingtalk';


const header = Array(19).fill(''); header[5] = DING_HEADERS.tid; header[13] = '脚本老师'; header[15] = DING_HEADERS.reference; header[18] = DING_HEADERS.final;
const data = { steps: [{ content: '长度\n单位 "cm"', narration: '旁白', extra: '保留' }], custom: { keep: true } };
function row(tid = '123', teacher = '老师甲', final = '') { const cells = Array(19).fill(''); cells[4] = '长度估测'; cells[5] = tid; cells[13] = teacher; cells[15] = JSON.stringify(data, null, 2); cells[18] = final; return cells; }
const tsv = (rows: string[][]) => rows.map(r => r.map(c => /[\t\n\r"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join('\t')).join('\r\n');

describe('钉钉任务与回填位置', () => {
  it('正确解析多行单元格、双引号、制表符和空单元格', () => {
    const rows = [['a\tb', 'line1\r\nline2 "text"', ''], ['', '', 'last']];
    expect(parseTableText(tsv(rows) + '\r\n')).toEqual(rows);
    expect(() => parseTableText('"unfinished')).toThrow('未闭合');
  });
  it('只读取 P 列，保留空行后的原位置、老师和扩展字段', () => {
    const result = importTableText(tsv([header, row(), Array(19).fill(''), row('456', '老师乙', JSON.stringify({ steps: [{ content: '已有最终结果' }] }))]));
    expect(result.problems).toEqual([]); expect(result.documents).toHaveLength(2);
    expect(result.documents[1].tableBinding).toMatchObject({ row: 4, tid: '456', scriptTeacher: '老师乙' });
    expect(result.documents[1].data).toEqual(data); expect(result.documents[0].data.custom).toEqual({ keep: true });
    expect(importTableText(tsv([header, row('456', '老师乙', '{"steps":[{"content":"最终结果"}]}')]), 1, true).documents[0].data.steps[0].content).toBe('最终结果');
  });
  it('复制数据区域指定起始行，解析失败也不改变后续行号', () => {
    const invalid = row(); invalid[15] = '{broken';
    const result = importTableText(tsv([invalid, row('456')]), 20);
    expect(result.problems).toHaveLength(1); expect(result.documents[0].tableBinding!.row).toBe(21);
    expect(() => importTableText(tsv([header.slice(1), row()]))).toThrow('表头不匹配');
  });
  it('审核通过后才导出，只复制连续行且不写审核元信息', () => {
    const docs = importTableText(tsv([header, row(), row('456')])).documents;
    expect(() => tableWrite(docs[0])).toThrow('尚未审核通过'); docs.forEach(d => d.status = 'approved');
    const copied = tableClipboard(docs); expect(copied.address).toBe('S2:S3');
    expect(copied.text.split('\n').map(line => JSON.parse(line))).toEqual([data, data]);
    docs[1].tableBinding!.row = 4; expect(() => tableClipboard(docs)).toThrow('不连续');
  });
  it('阻止 tid、参考 JSON 或最终 JSON 在导入后变动时回填', () => {
    const doc = importTableText(tsv([header, row()])).documents[0]; doc.status = 'approved'; const write = tableWrite(doc);
    expect(rowConflict(write, row())).toBeUndefined(); expect(rowConflict(write, row('999'))).toContain('tid');
    expect(rowConflict(write, row('123', '老师甲', '新结果'))).toContain('S 列');
    const updated = row(); updated[15] += 'changed'; expect(rowConflict(write, updated)).toContain('参考 JSON');
  });
});


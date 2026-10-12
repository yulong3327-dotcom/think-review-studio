import { useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ClipboardPaste, Copy, Download, FileSpreadsheet, Loader2, Table2, Upload, X } from 'lucide-react';
import { DING_URL, importTableText, matchesTeacher, tableClipboard, UNASSIGNED_TEACHER } from '../lib/dingtalk';
import { buildReviewedTable, prepareTableFile, resultsCsv } from '../lib/table-files';
import { downloadBlob, safeName } from '../lib/files';
import { loadTableFile } from '../lib/storage';
import type { ImportProblem, ReviewDocument } from '../types';

export function DingTablePanel({ documents, selected, onImport, onClose, notify }: {
  documents: ReviewDocument[]; selected: Set<string>; onImport: (docs: ReviewDocument[], problems: ImportProblem[]) => void;
  onClose: () => void; notify: (text: string) => void;
}) {
  const [mode, setMode] = useState<'import' | 'write'>('import');
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [text, setText] = useState(''), [startRow, setStartRow] = useState(1);
  const [preferFinal, setPreferFinal] = useState(false), [teacher, setTeacher] = useState('');
  const [preview, setPreview] = useState<ReviewDocument[]>([]), [issues, setIssues] = useState<ImportProblem[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [fileName, setFileName] = useState('');
  const [rowCount, setRowCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null), chosenFile = useRef<File | null>(null);
  const approved = documents.filter(doc => doc.tableBinding && doc.status === 'approved');
  const [checked, setChecked] = useState<Set<string>>(() => new Set(approved.filter(doc => selected.has(doc.id)).map(doc => doc.id)));
  const [source, setSource] = useState(approved[0]?.tableBinding?.fileId || 'paste');
  const sources = useMemo(() => [...new Map(approved.map(d => [d.tableBinding!.fileId || 'paste', d.tableBinding!.fileName || '表格复制文本'])).entries()], [approved]);
  const eligible = approved.filter(doc => (doc.tableBinding!.fileId || 'paste') === source);
  const writeDocs = eligible.filter(doc => checked.has(doc.id));
  const teachers = useMemo(() => [...new Set(preview.map(d => d.tableBinding!.scriptTeacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh')), [preview]);
  const importDocs = preview.filter(d => matchesTeacher(d, teacher));
  async function analyze(file?: File) {
    setBusy(true); setError(''); setPreview([]); setIssues([]);
    try {
      if (file) chosenFile.current = file;
      if (inputMode === 'file' && !chosenFile.current) throw new Error('请先选择完整表格文件。');
      const result = inputMode === 'file' ? await prepareTableFile(chosenFile.current!, preferFinal) : importTableText(text, startRow, preferFinal);
      setPreview(result.documents); setIssues(result.problems); setTeacher('');
      if ('fileName' in result && typeof result.fileName === 'string') { setFileName(result.fileName); setRowCount('rowCount' in result ? Number(result.rowCount) : 0); }
      if (!result.documents.length && !result.problems.length) setError('表格中没有找到可审核的 JSON。');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copy(docs: ReviewDocument[]) {
    try { const block = tableClipboard(docs); await navigator.clipboard.writeText(block.text); notify(`已复制 ${docs.length} 条 JSON，请核对 tid 后粘贴到「练习」表 ${block.address}。`); }
    catch (e) { setError((e as Error).message); }
  }
  async function exportFull() {
    setBusy(true); setError('');
    try {
      if (source === 'paste') throw new Error('复制导入的任务没有原文件。请使用「S 列结果 CSV」或逐行复制回填。');
      const file = await loadTableFile(source);
      if (!file) throw new Error('当前浏览器中找不到原表，请重新导入同一份文件恢复关联，已有审核会保留。');
      const result = await buildReviewedTable(file, writeDocs);
      const names = [...new Set(writeDocs.map(d => d.tableBinding!.scriptTeacher).filter(Boolean))];
      const suffix = names.length === 1 ? `_${names[0]}` : '_结果';
      downloadBlob(new Blob([result.bytes], { type: result.type }), `${safeName(file.name.replace(/\.[^.]+$/, ''))}_已审核${safeName(suffix)}.${result.extension}`);
      notify(`已导出完整表格，更新 ${writeDocs.length} 行 S 列。钉钉在线原表尚未修改。`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function exportResults() {
    try {
      downloadBlob(new Blob([resultsCsv(writeDocs)], { type: 'text/csv;charset=utf-8' }), 'Think_S列审核结果.csv');
      notify(`已导出 ${writeDocs.length} 条 S 列结果，含 tid 和原行号，便于汇总回填。`);
    } catch (e) { setError((e as Error).message); }
  }
  return <div className="modal-backdrop" onClick={() => !busy && onClose()}><section className="modal ding-modal" role="dialog" aria-modal="true" aria-label="表格审核任务" onClick={e => e.stopPropagation()}>
    <div className="modal-heading"><span className="modal-icon"><Table2 size={22}/></span><button className="icon-button" aria-label="关闭表格任务" disabled={busy} onClick={onClose}><X size={20}/></button></div>
    <h2>练习表 · 按老师审核</h2><p className="modal-description">P 列参考 JSON · N 列脚本老师 · S 列最终 JSON <a href={DING_URL} target="_blank" rel="noreferrer">打开钉钉表格 <ArrowUpRight size={12}/></a></p>
    <div className="modal-tabs"><button disabled={busy} className={mode === 'import' ? 'active' : ''} onClick={() => { setMode('import'); setError(''); }}>导入表格任务</button><button disabled={busy} className={mode === 'write' ? 'active' : ''} onClick={() => { setMode('write'); setError(''); }}>导出 S 列结果</button></div>
    {mode === 'import' ? <>
      <p className="ding-help">下载「练习」完整 CSV，或包含「练习」的 XLSX。直接在浏览器处理，无需企业应用授权。</p>
      <div className="ding-controls"><button className={`button ${inputMode === 'file' ? 'primary' : 'secondary'} small`} disabled={busy} onClick={() => { setInputMode('file'); setPreview([]); setError(''); }}><Upload size={14}/>下载文件导入</button><button className={`button ${inputMode === 'paste' ? 'primary' : 'secondary'} small`} disabled={busy} onClick={() => { setInputMode('paste'); setPreview([]); setError(''); }}><ClipboardPaste size={14}/>整表复制导入</button></div>
      <label className="export-check"><input type="checkbox" disabled={busy} checked={preferFinal} onChange={e => { setPreferFinal(e.target.checked); setPreview([]); }}/>优先审核 S 列已有最终 JSON（为空时使用 P 列）</label>
      {inputMode === 'file' ? <>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.xlsx" aria-label="选择练习表文件" className="hidden-file" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void analyze(file); e.target.value = ''; }}/>
        <button className="ding-file-drop" disabled={busy} onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy && e.dataTransfer.files[0]) void analyze(e.dataTransfer.files[0]); }}>{busy ? <Loader2 size={28} className="spin"/> : <FileSpreadsheet size={28}/>}<strong>{busy ? '正在解析整表…' : '选择或拖入下载的完整表格'}</strong><span>{fileName || 'CSV / TSV / XLSX · 自动识别老师与题目'}</span></button>
        {chosenFile.current && !preview.length && !busy && <button className="button secondary small" onClick={() => void analyze()}>重新识别所选文件</button>}
      </> : <>
        <div className="ding-controls"><label>复制区域的起始行<input type="number" min={1} aria-label="表格起始行" value={startRow} onChange={e => { setStartRow(Number(e.target.value)); setPreview([]); }}/></label><span className="ding-help">含表头填 1；从 A 列起复制完整行，保留中间空行。</span></div>
        <textarea className="code-editor ding-paste" aria-label="表格复制文本" value={text} disabled={busy} onChange={e => { setText(e.target.value); setPreview([]); }} placeholder="粘贴完整 A～S 列的表格区域…"/>
        <button className="button secondary small" disabled={!text.trim() || busy} onClick={() => void analyze()}>识别表格任务</button>
      </>}
      {preview.length > 0 && <><div className="ding-controls"><label>脚本老师<select aria-label="导入任务老师" value={teacher} onChange={e => setTeacher(e.target.value)}><option value="">全部老师（{preview.length}）</option>{preview.some(d=>!d.tableBinding!.scriptTeacher)&&<option value={UNASSIGNED_TEACHER}>未分配（{preview.filter(d=>!d.tableBinding!.scriptTeacher).length}）</option>}{teachers.map(name => <option key={name} value={name}>{name}（{preview.filter(d => d.tableBinding!.scriptTeacher === name).length}）</option>)}</select></label><strong>{importDocs.length} 条可导入任务</strong><span>{teachers.length} 个老师分组{inputMode === 'file' ? ` · 原表 ${rowCount} 行` : ''}</span></div>
      <div className="ding-preview"><table><thead><tr><th>回填位置</th><th>题目 / tid</th><th>脚本老师</th><th>S 列现状</th></tr></thead><tbody>{importDocs.slice(0,30).map(doc => <tr key={doc.id}><td>S{doc.tableBinding!.row}</td><td>{doc.name}</td><td>{doc.tableBinding!.scriptTeacher || '未填写'}</td><td>{doc.tableBinding!.finalRaw.trim() ? '已有结果' : '空'}</td></tr>)}</tbody></table>{importDocs.length > 30 && <p>另外 {importDocs.length - 30} 条将一起导入。</p>}</div></>}
      {issues.length > 0 && <div className="import-problems"><strong>{issues.length} 行解析有问题，原内容会保留</strong>{issues.slice(0,8).map((p,i) => <p key={i}>{p.source}：{p.message}</p>)}</div>}
    </> : <>
      <p className="ding-help">选择已审核通过的任务，导出后仅更新这些行的 S 列。在线原表不会自动同步；多人协作时请按 tid 汇总「S 列结果 CSV」，或逐行复制回填。</p>
      {sources.length > 0 && <label className="teacher-filter"><span>导入来源</span><select aria-label="导出原表文件" disabled={busy} value={source} onChange={e => { setSource(e.target.value); setChecked(new Set()); setError(''); }}>{sources.map(([id, name]) => <option key={id} value={id}>{name}{id === 'paste' ? '' : ` · ${id.slice(0,6)}`}</option>)}</select></label>}
      <div className="ding-controls"><label className="export-check"><input type="checkbox" aria-label="选择全部可回填任务" disabled={busy} checked={eligible.length > 0 && eligible.every(d => checked.has(d.id))} onChange={e => setChecked(new Set(e.target.checked ? eligible.map(d => d.id) : []))}/>选择全部</label><strong>{writeDocs.length} / {eligible.length} 条已审核任务</strong><button className="button secondary small" disabled={!writeDocs.length || busy} onClick={() => void copy(writeDocs)}><Copy size={13}/>复制连续行 JSON</button><button className="button secondary small" disabled={!writeDocs.length || busy} onClick={exportResults}><Download size={13}/>S 列结果 CSV</button></div>
      <div className="ding-preview"><table><thead><tr><th>选择</th><th>回填位置</th><th>题目 / tid</th><th>脚本老师</th><th>复制</th></tr></thead><tbody>{eligible.map(doc => <tr key={doc.id}><td><input type="checkbox" aria-label={`回填 S${doc.tableBinding!.row}`} checked={checked.has(doc.id)} disabled={busy} onChange={e => setChecked(ids => { const next = new Set(ids); e.target.checked ? next.add(doc.id) : next.delete(doc.id); return next; })}/></td><td>S{doc.tableBinding!.row}</td><td>{doc.name}</td><td>{doc.tableBinding!.scriptTeacher || '未填写'}</td><td><button className="icon-button" disabled={busy} aria-label={`复制 S${doc.tableBinding!.row} JSON`} onClick={() => void copy([doc])}><Copy size={14}/></button></td></tr>)}</tbody></table>{!eligible.length && <p>当前老师还没有已审核通过的表格任务，请先完成审核。</p>}</div>
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="modal-footer"><span>{mode === 'import' ? '原表和进度保存在当前浏览器' : '只更新所选行的 S 列'}</span>{mode === 'import' ? <button className="button primary" disabled={!importDocs.length || busy} onClick={() => { onImport(importDocs, issues); onClose(); }}>导入 {importDocs.length} 条任务</button> : <button className="button primary" disabled={source === 'paste' || !writeDocs.length || busy} onClick={() => void exportFull()}>{busy ? <Loader2 size={14} className="spin"/> : <Download size={14}/>}导出已回填完整表格</button>}</div>
  </section></div>;
}

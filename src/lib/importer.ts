import type { ImportResult, ThinkData } from '../types';

function unwrap(value: unknown, depth = 0): ThinkData[] {
  if (depth > 5) return [];
  if (typeof value === 'string') {
    try { return unwrap(JSON.parse(stripFence(value)), depth + 1); } catch { return []; }
  }
  if (Array.isArray(value)) return value.flatMap(item => unwrap(item, depth + 1));
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.steps)) return [object as unknown as ThinkData];
    for (const key of ['documents', 'records', 'items', 'data', 'results', 'json', 'output', 'response', 'content']) {
      if (object[key] !== undefined) {
        const found = unwrap(object[key], depth + 1);
        if (found.length) return found;
      }
    }
  }
  return [];
}

function stripFence(text: string): string {
  return text.replace(/^\uFEFF/, '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// Scan complete JSON values. Braces in drawing-function strings must remain strings.
function balancedValues(text: string): { values: string[]; incomplete: boolean } {
  const values: string[] = [];
  let start = -1, depth = 0, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start === -1) {
      if (char === '{' || char === '[') { start = i; depth = 1; inString = false; escaped = false; }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      depth--;
      if (!depth) { values.push(text.slice(start, i + 1)); start = -1; }
    }
  }
  return { values, incomplete: start !== -1 };
}

export function parseThinkText(raw: string): ImportResult {
  const text = stripFence(raw);
  if (!text) return { documents: [], errors: ['内容为空，请选择文件或粘贴 JSON。'] };
  try {
    const documents = unwrap(JSON.parse(text));
    return documents.length
      ? { documents, errors: [] }
      : { documents: [], errors: ['未找到 steps 数组，请导入 Think JSON 数据。'] };
  } catch { /* Continue with multi-document and spreadsheet-quoted input. */ }
  // Excel/CSV copies escape each quote by doubling it, including quotes inside JS.
  const normalized = /""steps""\s*:/.test(text) ? text.replace(/""/g, '"') : text;
  const { values, incomplete } = balancedValues(normalized);
  const documents: ThinkData[] = [];
  const errors: string[] = [];
  for (const [index, value] of values.entries()) {
    try {
      const found = unwrap(JSON.parse(value));
      if (found.length) documents.push(...found);
      else errors.push(`第 ${index + 1} 段 JSON 未找到 steps 数组。`);
    } catch (error) { errors.push(`第 ${index + 1} 段 JSON 解析失败：${(error as Error).message}`); }
  }
  if (incomplete) errors.push('存在未闭合的 JSON，请检查括号或字符串引号。');
  if (!values.length && !incomplete) errors.push('没有识别到 JSON 对象。支持普通 JSON、数组、JSONL、Markdown 代码块及表格复制文本。');
  return { documents, errors };
}

export function validateThink(data: ThinkData): string[] {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') return ['JSON 顶层必须是包含 steps 的对象。'];
  if (!Array.isArray(data.steps) || !data.steps.length) return ['steps 至少需要一个讲解步骤。'];
  if (data.func_list !== undefined && !Array.isArray(data.func_list)) return ['func_list 必须是数组。'];
  const functions = data.func_list || [];
  functions.forEach((fn, i) => {
    if (!fn || typeof fn !== 'object') { errors.push(`绘图函数 ${i + 1} 必须是对象。`); return; }
    if (typeof fn.name !== 'string' || !fn.name) errors.push(`绘图函数 ${i + 1} 缺少名称。`);
    if (typeof fn.func !== 'string' || !fn.func.trim()) errors.push(`绘图函数 ${i + 1} 缺少代码。`);
  });
  data.steps.forEach((step, i) => {
    if (!step || typeof step !== 'object') { errors.push(`步骤 ${i + 1} 必须是对象。`); return; }
    if (typeof step.content !== 'string') errors.push(`步骤 ${i + 1} 的 content 必须是字符串。`);
    if (step.type !== undefined && typeof step.type !== 'string') errors.push(`步骤 ${i + 1} 的 type 必须是字符串。`);
    if (step.func !== undefined && typeof step.func !== 'string') errors.push(`步骤 ${i + 1} 的 func 必须是字符串。`);
    if (step.narration !== undefined && typeof step.narration !== 'string') errors.push(`步骤 ${i + 1} 的 narration 必须是字符串。`);
    if (step.func_params !== undefined && !Array.isArray(step.func_params)) errors.push(`步骤 ${i + 1} 的 func_params 必须是数组。`);
    if (step.func && !functions.some(fn => fn && fn.name === step.func &&
      (fn['question-index'] === undefined || String(fn['question-index']) === String(step['question-index'] ?? 1)))) {
      errors.push(`步骤 ${i + 1} 引用了不存在的绘图函数 ${step.func}。`);
    }
  });
  return errors;
}

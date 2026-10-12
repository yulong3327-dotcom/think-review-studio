import fs from 'node:fs';
const raw = fs.readFileSync(process.argv[2] || 'examples/think-表格文本.txt', 'utf8');
const text = raw.replace(/""/g, '"');
let start = -1, depth = 0, inString = false, escaped = false;
const documents = [];
for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (start < 0) { if (c === '{') { start = i; depth = 1; } continue; }
  if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
  if (c === '"') inString = true;
  else if (c === '{' || c === '[') depth++;
  else if (c === '}' || c === ']') { depth--; if (!depth) { try { documents.push(JSON.parse(text.slice(start, i + 1))); } catch(e) { console.log('Parse error', e.message); } start = -1; } }
}
fs.mkdirSync('src/data', {recursive:true});
fs.writeFileSync('src/data/samples.json', JSON.stringify(documents));
fs.mkdirSync('examples', {recursive:true});
fs.writeFileSync('examples/think-批量示例.json', JSON.stringify(documents, null, 2));
console.log(JSON.stringify(documents.map((d,i)=>({index:i+1,steps:d.steps?.length,functions:d.func_list?.length,title:d.steps?.[0]?.content?.slice(0,100),keys:Object.keys(d)})),null,2));
console.log('characters',raw.length,'documents',documents.length,'incomplete',start>=0);

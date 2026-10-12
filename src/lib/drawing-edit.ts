import { parse, type Token } from 'acorn';

// Use JavaScript tokens so a label edit cannot accidentally alter comments or code.
export function replaceDrawingLabel(code:string, before:string, after:string): {code:string;count:number} {
  if(!before) return {code,count:0};
  const tokens:Array<Token & {value?:unknown}>=[];
  parse(code,{ecmaVersion:'latest',onToken:tokens});
  const matches=tokens.filter(token=>token.type.label==='string'&&token.value===before);
  let output=code;
  for(const token of [...matches].reverse())output=output.slice(0,token.start)+JSON.stringify(after)+output.slice(token.end);
  return {code:output,count:matches.length};
}

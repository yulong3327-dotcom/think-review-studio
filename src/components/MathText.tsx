import { Fragment } from 'react';
import katex from 'katex';

export function MathText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g);
  return <div className="math-text">{parts.map((part, i) => {
    if ((part.startsWith('$') && part.endsWith('$')) || /^\\[\[(]/.test(part)) {
      const displayMode = part.startsWith('$$') || part.startsWith('\\[');
      const formula = part.startsWith('$$') ? part.slice(2,-2) : part.startsWith('$') ? part.slice(1,-1) : part.slice(2,-2);
      try { return <span key={i} dangerouslySetInnerHTML={{__html:katex.renderToString(formula, {displayMode,throwOnError:false,trust:false,strict:'ignore'})}}/>; }
      catch { return <span key={i}>{part}</span>; }
    }
    return <Fragment key={i}>{part.split(/(\*\*[^*]+\*\*)/g).map((segment,j)=>segment.startsWith('**')?<strong key={j}>{segment.slice(2,-2)}</strong>:<Fragment key={j}>{segment}</Fragment>)}</Fragment>;
  })}</div>;
}

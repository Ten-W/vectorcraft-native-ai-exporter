import coverage from './font-coverage.json' with {type:'json'};
// Coverage is derived from the exact nine bundled open fonts, not guessed from a family name.
export function checkKnownGlyphs(postScriptName,text){
 const ranges=coverage[postScriptName];if(!ranges)return;
 const missing=[...new Set([...text].filter(c=>!/[\s\p{Cf}\p{Cc}]/u.test(c)&&!ranges.some(([a,b])=>c.codePointAt(0)>=a&&c.codePointAt(0)<=b)))];
 if(missing.length)throw Error(`字体「${postScriptName}」缺少字符：${missing.slice(0,16).join(' ')}。请为这些文字选择支持的字体后导出。`);
}

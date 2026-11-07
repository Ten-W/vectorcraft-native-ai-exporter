// Preserve Illustrator Txt2 real tokens: 24 and 24.0 are distinct native value types.
// Structural parsing/serialization remains ai-file's MIT implementation; no eval is used.
import {parseTxt2,writeTxt2,parseDictBlock} from 'ai-file';
const marker='~VC_REAL~';
const number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
export function real(value){
  if(value&&typeof value==='object'&&typeof value.raw==='string'&&value.raw.startsWith(marker))return value;
  if(!Number.isFinite(value))throw Error('Invalid real value');
  const rounded=Number(value.toFixed(5));
  return {raw:marker+(Number.isInteger(rounded)?rounded.toFixed(1):String(rounded))};
}
export function parseTypedTxt2(bytes){
  const s=Buffer.from(bytes).toString('latin1');let out='',i=0;
  while(i<s.length){
    const start=i,c=s[i];
    if(c==='('){
      let depth=1;i++;
      while(i<s.length&&depth){if(s[i]==='\\'){i+=2;continue;}if(s[i]==='(')depth++;if(s[i]===')')depth--;i++;}
    }else if(c==='/'){i++;while(i<s.length&&!/[\s<>\[\]()\/\x00]/.test(s[i]))i++;}
    else if(/[+\-.0-9]/.test(c)){
      i++;while(i<s.length&&!/[\s<>\[\]()\/\x00]/.test(s[i]))i++;
      const token=s.slice(start,i);
      if(number.test(token)&&/[.e]/i.test(token)){out+='('+marker+token+')';continue;}
    }else i++;
    out+=s.slice(start,i);
  }
  return parseTxt2(Buffer.from(out,'latin1'));
}
export function writeTypedTxt2(root){
  return writeTxt2(root).replace(/\(~VC_REAL~([+\-.0-9eE]+)\)/g,(all,n)=>{if(!number.test(n))throw Error('Invalid typed real');return n;});
}
export function textSchemaFromFile(file){
  const st=file.document.statements;
  function block(name){
    const i=st.findIndex(s=>s.op===':'&&s.args.some(a=>a.t==='n'&&a.v===name));
    if(i<0)return undefined;
    const raw=parseDictBlock(st,i).roots[0]?.binary;
    if(!raw)throw Error('Missing raw Txt2 block: '+name);
    return parseTypedTxt2(raw);
  }
  return {root:block('AI11TextDocument'),undoRoot:block('AI11UndoFreeTextDocument'),rulerOrigin:file.document.text.rulerOrigin};
}

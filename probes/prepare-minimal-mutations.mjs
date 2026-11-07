// Change one field category of a verified reference, preserving all other bytes/typed data.
import fs from 'node:fs';
import path from 'node:path';
import {readAiBytes} from 'ai-file';
import {textSchemaFromFile,writeTypedTxt2,real} from '../native/txt2.mjs';
import {ascii85Lines} from '../native/stream.mjs';
import {attachNative} from '../independent-export.mjs';
const [reference,harness]=process.argv.slice(2),bytes=fs.readFileSync(reference),file=readAiBytes(bytes);
const original=Buffer.from(file.container.stream).toString('latin1'),work=fs.mkdtempSync(path.resolve('work/mutations-'));
const variants={
 'content-only':s=>{const t=s.root.get('1').get('1')[0];t.get('0').set('0','中文尺寸全新文字\r');t.get('0').get('6').get('0')[0].set('1',9);},
 'leading-only':s=>{for(const t of s.root.get('1').get('1'))t.get('0').get('6').get('0')[0].get('0').get('0').get('6').set('5',real(28.8));},
 'identifiers-only':s=>{s.root.get('0').get('8').get('0').forEach((f,i)=>f.get('0').set('97',{raw:`00000000-0000-4000-9000-${String(i+1).padStart(12,'0')}`}));s.root.get('1').get('1').forEach((t,i)=>t.get('0').get('6').get('0')[0].get('0').get('0').set('97',{raw:`00000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`}));}
};
const cases=[];
for(const [name,change]of Object.entries(variants)){
 const schema=textSchemaFromFile(file);change(schema);
 const encode=root=>ascii85Lines(Buffer.from(writeTypedTxt2(root),'latin1'));
 const start='%AI11_BeginTextDocument',end='%AI11_EndTextDocument',i=original.indexOf(start),j=original.indexOf(end,i);
 const section=`${start}\r/AI11TextDocument : /ASCII85Decode ,\r${encode(schema.root)}\r${schema.rulerOrigin.join(' ')} /RulerOrigin ,\r;\r/AI11UndoFreeTextDocument : /ASCII85Decode ,\r${encode(schema.undoRoot)}\r;\r${end}`;
 const stream=original.slice(0,i)+section+original.slice(j+end.length),output=path.join(work,name+'.ai');
 fs.writeFileSync(output,await attachNative(bytes,Buffer.from(stream,'latin1')));cases.push(output.replace(/\\/g,'/'));
}
const prefix=`var CASES=${JSON.stringify(cases)};var REPORT=${JSON.stringify(path.join(work,'mutation-report.json').replace(/\\/g,'/'))};`;
const script=fs.readFileSync(harness,'utf8').replace(/^\ufeff/,'').replace(/^var CASES=.*?;var REPORT=.*?;/,()=>prefix);
fs.writeFileSync(path.join(work,'check-mutations.jsx'),'\ufeff'+script);
console.log(JSON.stringify({work,script:path.join(work,'check-mutations.jsx')},null,2));

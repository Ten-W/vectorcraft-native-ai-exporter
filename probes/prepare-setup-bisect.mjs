// Local synthetic-only section isolation. Does not distribute Illustrator's preset data.
import fs from 'node:fs';
import path from 'node:path';
import {readAiBytes} from 'ai-file';
import {attachNative} from '../independent-export.mjs';
const [reference,generated,harness]=process.argv.slice(2);
if(!reference||!generated||!harness)throw Error('Pass reference.ai generated.ai and an existing audit JSX');
const refBytes=fs.readFileSync(reference);
const text=file=>Buffer.from(readAiBytes(fs.readFileSync(file)).container.stream).toString('latin1');
const a=text(reference),b=text(generated),work=fs.mkdtempSync(path.resolve('work/setup-bisect-'));
function section(s,start,end){const i=s.indexOf(start),j=s.indexOf(end,i);if(i<0||j<i)throw Error('Missing section '+start);return s.slice(i,j+end.length);}
function replace(s,start,end,value){return s.replace(section(s,start,end),()=>value);}
const begin='%AI11_BeginTextDocument',end='%AI11_EndTextDocument';
const refText=section(a,begin,end),ownText=section(b,begin,end);
const body=s=>s.slice(s.indexOf('%%EndSetup')+10);
const head=s=>s.slice(0,s.indexOf('%%EndSetup')+10);
const minimalRealText=replace(head(b),begin,end,refText)+body(b);
const docStart='%AI9_BeginDocumentData',docEnd='%AI9_EndDocumentData';
const styleSections=[['%AI9_BeginArtStyles','%AI9_EndArtStyles'],['%AI9_BeginArtStyleList','%AI9_EndArtStyleList']].map(([x,y])=>`%AI5_Begin_NonPrinting\r${section(a,x,y)}\r%AI5_End_NonPrinting--\r`).join('');
const cases={
  'reference-setup-new-text':replace(head(a),begin,end,ownText)+body(b),
  'minimal-setup-reference-text':minimalRealText,
  'real-document-data':replace(minimalRealText,docStart,docEnd,section(a,docStart,docEnd)),
  'real-art-styles':minimalRealText.replace('%%BeginSetup','%%BeginSetup\r'+styleSections)
};
const paths=[];
for(const [name,stream]of Object.entries(cases)){const file=path.join(work,name+'.ai');fs.writeFileSync(file,await attachNative(refBytes,Buffer.from(stream,'latin1')));paths.push(file.replace(/\\/g,'/'));}
const original=fs.readFileSync(harness,'utf8').replace(/^\ufeff/,'');
const prefix=`var CASES=${JSON.stringify(paths)};var REPORT=${JSON.stringify(path.join(work,'bisect-report.json').replace(/\\/g,'/'))};`;
fs.writeFileSync(path.join(work,'check-setup.jsx'),'\ufeff'+original.replace(/^var CASES=.*?;var REPORT=.*?;/,prefix));
console.log(JSON.stringify({work,script:path.join(work,'check-setup.jsx')},null,2));

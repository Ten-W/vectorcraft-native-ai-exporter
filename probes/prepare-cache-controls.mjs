import fs from 'node:fs';
import path from 'node:path';
import {readAiBytes} from 'ai-file';
import {textSchemaFromFile,writeTypedTxt2} from '../native/txt2.mjs';
import {ascii85Lines} from '../native/stream.mjs';
import {attachNative} from '../independent-export.mjs';
const [reference,generated,harness]=process.argv.slice(2);
const refBytes=fs.readFileSync(reference),ref=readAiBytes(refBytes),own=readAiBytes(fs.readFileSync(generated));
const work=fs.mkdtempSync(path.resolve('work/cache-controls-'));
const text=file=>Buffer.from(file.container.stream).toString('latin1');
const a=text(ref),b=text(own),start='%AI11_BeginTextDocument',end='%AI11_EndTextDocument';
function section(schema){const encode=root=>ascii85Lines(Buffer.from(writeTypedTxt2(root),'latin1'));return `${start}\r/AI11TextDocument : /ASCII85Decode ,\r${encode(schema.root)}\r${schema.rulerOrigin.join(' ')} /RulerOrigin ,\r;\r${schema.undoRoot?'/AI11UndoFreeTextDocument : /ASCII85Decode ,\r'+encode(schema.undoRoot)+'\r;\r':''}${end}`;}
function replace(s,value){const i=s.indexOf(start),j=s.indexOf(end,i);return s.slice(0,i)+value+s.slice(j+end.length);}
const typedReference=textSchemaFromFile(ref);
const emptyLayout=textSchemaFromFile(own);
for(const story of emptyLayout.root.get('1').get('1'))story.get('1').set('2',[]);
const bEmpty=replace(b,section(emptyLayout));
const header=s=>s.slice(0,s.indexOf('%%EndSetup')+10),body=s=>s.slice(s.indexOf('%%EndSetup')+10);
let legacy=b.replace(/%AI11_BeginTextDocument[\s\S]*?%AI11_EndTextDocument/,'');
legacy=legacy.replace(/\/AI11Text :\r0 \/FreeUndo ,\r0 \/FrameIndex ,\r(\d+) \/StoryIndex ,\r2 \/TextAntialiasing ,\r;/g,(_,id)=>{
  const chinese=id==='0',font=chinese?'MicrosoftYaHei':'ArialMT',x=chinese?30:460;
  const value=chinese?'\\326\\320\\316\\304\\263\\337\\264\\347':'Editable text';
  return `0 To\r1 0 0 1 ${x} -60 0 Tp\rTP\r0 Ta\r0 0 0 Ti\r0 Tr\r0 g\r0 O\r/_${font} 24 21 6 Tf\r0 Ts\r100 100 Tz\r0 Tt\r1 TA\r28.8 0 Tl\r(${value}) Tx\rTO`;
});
const variants={
  'typed-reference-roundtrip':replace(a,section(typedReference)),
  'empty-layout-reference-setup':replace(header(a),section(emptyLayout))+body(bEmpty),
  'empty-layout-minimal-setup':bEmpty,
  'legacy-chinese-probe':legacy
};
const paths=[];for(const [name,s]of Object.entries(variants)){const file=path.join(work,name+'.ai');fs.writeFileSync(file,await attachNative(refBytes,Buffer.from(s,'latin1')));paths.push(file.replace(/\\/g,'/'));}
const prefix=`var CASES=${JSON.stringify(paths)};var REPORT=${JSON.stringify(path.join(work,'cache-report.json').replace(/\\/g,'/'))};`;
let script=fs.readFileSync(harness,'utf8').replace(/^\ufeff/,'').replace(/^var CASES=.*?;var REPORT=.*?;/,prefix);
script=script.replace('paths:doc.pathItems.length,texts:texts','paths:doc.pathItems.length,legacyText:doc.legacyTextItems.length,texts:texts');
fs.writeFileSync(path.join(work,'check-cache.jsx'),'\ufeff'+script);
console.log(JSON.stringify({work,script:path.join(work,'check-cache.jsx')},null,2));

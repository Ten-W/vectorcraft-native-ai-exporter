// Synthetic local-reference diagnostic: isolate text paint references into setup ArtStyles.
import fs from 'node:fs';
import path from 'node:path';
import {readAiBytes} from 'ai-file';
import {textSchemaFromFile,writeTypedTxt2} from '../native/txt2.mjs';
import {ascii85Lines} from '../native/stream.mjs';
import {attachNative} from '../independent-export.mjs';
const [reference,generated,harness]=process.argv.slice(2);
const refBytes=fs.readFileSync(reference),ref=readAiBytes(refBytes),own=readAiBytes(fs.readFileSync(generated));
const a=Buffer.from(ref.container.stream).toString('latin1'),b=Buffer.from(own.container.stream).toString('latin1');
const work=fs.mkdtempSync(path.resolve('work/style-controls-'));
const start='%AI11_BeginTextDocument',end='%AI11_EndTextDocument';
const section=s=>s.slice(s.indexOf(start),s.indexOf(end)+end.length);
const replace=(s,t)=>{const i=s.indexOf(start),j=s.indexOf(end,i);return s.slice(0,i)+t+s.slice(j+end.length);};
const head=s=>s.slice(0,s.indexOf('%%EndSetup')+10),body=s=>s.slice(s.indexOf('%%EndSetup')+10);
const schema=textSchemaFromFile(own);
function clean(v){if(v instanceof Map){if(v.get('99')?.name==='CAITextPaint'){v.set('99',{name:'SimplePaint'});v.delete('5');}for(const x of v.values())clean(x);}else if(Array.isArray(v))v.forEach(clean);}
clean(schema.root);if(schema.undoRoot)clean(schema.undoRoot);
const encode=root=>ascii85Lines(Buffer.from(writeTypedTxt2(root),'latin1'));
const cleanSection=`${start}\r/AI11TextDocument : /ASCII85Decode ,\r${encode(schema.root)}\r${schema.rulerOrigin.join(' ')} /RulerOrigin ,\r;\r${schema.undoRoot?'/AI11UndoFreeTextDocument : /ASCII85Decode ,\r'+encode(schema.undoRoot)+'\r;\r':''}${end}`;
const variants={
 'reference-setup-generated-text':replace(head(a),section(b))+body(b),
 'minimal-setup-simple-text-paints':replace(b,cleanSection)
};
const cases=[];for(const [name,s]of Object.entries(variants)){const file=path.join(work,name+'.ai');fs.writeFileSync(file,await attachNative(refBytes,Buffer.from(s,'latin1')));cases.push(file.replace(/\\/g,'/'));}
const prefix=`var CASES=${JSON.stringify(cases)};var REPORT=${JSON.stringify(path.join(work,'styles-report.json').replace(/\\/g,'/'))};`;
const script=fs.readFileSync(harness,'utf8').replace(/^\ufeff/,'').replace(/^var CASES=.*?;var REPORT=.*?;/,()=>prefix);
fs.writeFileSync(path.join(work,'check-styles.jsx'),'\ufeff'+script);
console.log(JSON.stringify({work,script:path.join(work,'check-styles.jsx')},null,2));

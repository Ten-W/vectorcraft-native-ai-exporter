// Diagnose only synthetic reference data. These retained engine tables are never export inputs.
import fs from 'node:fs';
import path from 'node:path';
import {readAiBytes} from 'ai-file';
import {textSchemaFromFile,writeTypedTxt2} from '../native/txt2.mjs';
import {ascii85Lines} from '../native/stream.mjs';
import {attachNative} from '../independent-export.mjs';
const [reference,harness]=process.argv.slice(2);
if(!reference||!harness)throw Error('Pass synthetic reference.ai and check-matrix.jsx');
const bytes=fs.readFileSync(reference),file=readAiBytes(bytes);
const original=Buffer.from(file.container.stream).toString('latin1');
const begin='%AI11_BeginTextDocument',end='%AI11_EndTextDocument';
const i=original.indexOf(begin),j=original.indexOf(end,i);
if(i<0||j<i)throw Error('Missing text section');
const work=fs.mkdtempSync(path.resolve('work/resource-controls-')),cases=[];
const encode=root=>ascii85Lines(Buffer.from(writeTypedTxt2(root),'latin1'));
for(const variant of ['without-engine-descriptors','without-unused-resources','without-identifiers','minimal-font-records','without-layout']){
  const schema=textSchemaFromFile(file);
  for(const root of [schema.root,schema.undoRoot]){
    if(variant==='without-engine-descriptors'){root.get('1').delete('4');root.get('1').delete('5');}
    else if(variant==='without-unused-resources'){for(const key of ['2','3','4','9'])root.get('0').delete(key);}
    else if(variant==='without-identifiers'){
      function strip(v){if(v instanceof Map){v.delete('97');for(const x of v.values())strip(x);}else if(Array.isArray(v))v.forEach(strip);}
      strip(root);
    }else if(variant==='minimal-font-records'){
      for(const entry of root.get('0').get('1').get('0')){
        const font=entry.get('0'),description=font.get('0');
        entry.set('0',new Map([['99',{name:'CoolTypeFont'}],['0',new Map([['0',description.get('0')],['2',description.get('2')]])]]));
      }
    }else for(const story of root.get('1').get('1')||[])story.get('1').delete('2');
  }
  const section=`${begin}\r/AI11TextDocument : /ASCII85Decode ,\r${encode(schema.root)}\r${schema.rulerOrigin.join(' ')} /RulerOrigin ,\r;\r/AI11UndoFreeTextDocument : /ASCII85Decode ,\r${encode(schema.undoRoot)}\r;\r${end}`;
  const output=path.join(work,variant+'.ai');
  fs.writeFileSync(output,await attachNative(bytes,Buffer.from(original.slice(0,i)+section+original.slice(j+end.length),'latin1')),{flag:'wx'});
  cases.push(output.replace(/\\/g,'/'));
}
const report=path.join(work,'resource-report.json').replace(/\\/g,'/');
const source=fs.readFileSync(harness,'utf8').replace(/^\ufeff/,'');
fs.writeFileSync(path.join(work,'check-resources.jsx'),'\ufeff'+source.replace(/^var CASES=.*?;var REPORT=.*?;/,()=>`var CASES=${JSON.stringify(cases)};var REPORT=${JSON.stringify(report)};`));
console.log(JSON.stringify({work,script:path.join(work,'check-resources.jsx')},null,2));

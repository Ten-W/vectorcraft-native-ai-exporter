// Local synthetic references only: isolate PDF recognition from newly generated text.
import fs from 'node:fs';
import path from 'node:path';
import {PDFDocument,PDFName} from 'pdf-lib';
import {readAiBytes} from 'ai-file';
import {attachNative} from '../independent-export.mjs';
const [reference,generated,harness]=process.argv.slice(2);
if(!reference||!generated||!harness)throw Error('Pass synthetic reference.ai generated.ai and existing check-matrix.jsx');
const ref=fs.readFileSync(reference),own=fs.readFileSync(generated);
const stream=bytes=>readAiBytes(bytes).container.stream;
const work=fs.mkdtempSync(path.resolve('work/envelope-controls-'));
const cases=[];
async function write(name,preview,native,stripMetadata=false){
  if(stripMetadata){const pdf=await PDFDocument.load(preview);pdf.catalog.delete(PDFName.of('Metadata'));preview=await pdf.save({useObjectStreams:false});}
  const output=path.join(work,name+'.ai');fs.writeFileSync(output,await attachNative(preview,native),{flag:'wx'});cases.push(output.replace(/\\/g,'/'));
}
// Known-good records in each envelope; no new text engine structure in these controls.
await write('reference-envelope-reference-records',ref,stream(ref));
await write('generated-envelope-reference-records',own,stream(ref));
await write('without-xmp-reference-records',own,stream(ref),true);
// New structure only after the envelope controls have been checked.
await write('reference-envelope-generated-records',ref,stream(own));
const report=path.join(work,'envelope-report.json').replace(/\\/g,'/');
const original=fs.readFileSync(harness,'utf8').replace(/^\ufeff/,'');
const prefix=`var CASES=${JSON.stringify(cases)};var REPORT=${JSON.stringify(report)};`;
fs.writeFileSync(path.join(work,'check-envelope.jsx'),'\ufeff'+original.replace(/^var CASES=.*?;var REPORT=.*?;/,()=>prefix));
console.log(JSON.stringify({work,script:path.join(work,'check-envelope.jsx')},null,2));

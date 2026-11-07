import fs from 'node:fs';
import path from 'node:path';
import {readAiBytes,serializeAiStream} from 'ai-file';
import {attachNative} from '../independent-export.mjs';
const [reference,generated,harness]=process.argv.slice(2);
const refBytes=fs.readFileSync(reference),own=readAiBytes(fs.readFileSync(generated));
const work=fs.mkdtempSync(path.resolve('work/text-fields-')),paths=[];
const variants={
  'frame-ids':doc=>{for(const [i,frame]of doc.text.frames.entries())frame.raw.set('97',{raw:`00000000-0000-4000-9000-${String(i+1).padStart(12,'0')}`});},
  'character-ids':doc=>{for(const [i,story]of doc.text.stories.entries())story.raw.get('0').get('6').get('0')[0].get('0').get('0').set('97',{raw:`00000000-0000-4000-a000-${String(i+1).padStart(12,'0')}`});},
  'character-features':doc=>{for(const [i,story]of doc.text.stories.entries())story.raw.get('0').get('6').get('0')[0].get('0').get('0').set('6',structuredClone(own.document.text.stories[i].raw.get('0').get('6').get('0')[0].get('0').get('0').get('6')));},
  'generated-stories':doc=>{doc.text.root.get('1').set('1',structuredClone(own.document.text.root.get('1').get('1')));},
  'generated-frames':doc=>{doc.text.root.get('0').get('8').set('0',structuredClone(own.document.text.root.get('0').get('8').get('0')));}
};
for(const [name,change]of Object.entries(variants)){
  const ref=readAiBytes(refBytes);change(ref.document);ref.document.textDirty=true;
  const file=path.join(work,name+'.ai');fs.writeFileSync(file,await attachNative(refBytes,serializeAiStream(ref.document)));paths.push(file.replace(/\\/g,'/'));
}
const prior=fs.readFileSync(harness,'utf8').replace(/^\ufeff/,'');
const prefix=`var CASES=${JSON.stringify(paths)};var REPORT=${JSON.stringify(path.join(work,'fields-report.json').replace(/\\/g,'/'))};`;
fs.writeFileSync(path.join(work,'check-fields.jsx'),'\ufeff'+prior.replace(/^var CASES=.*?;var REPORT=.*?;/,prefix));
console.log(JSON.stringify({work,script:path.join(work,'check-fields.jsx')},null,2));

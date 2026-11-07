// Synthetic-only diagnostic: isolate the text engine version, not a supported export option.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readAiBytes} from 'ai-file';
import {textSchemaFromFile,writeTypedTxt2} from '../native/txt2.mjs';
import {ascii85Lines} from '../native/stream.mjs';
import {attachNative} from '../independent-export.mjs';

const input=process.argv[2];
if(!input)throw Error('Pass a generated synthetic .ai file');
const bytes=fs.readFileSync(input),file=readAiBytes(bytes);
const original=Buffer.from(file.container.stream).toString('latin1');
const start='%AI11_BeginTextDocument',end='%AI11_EndTextDocument';
const i=original.indexOf(start),j=original.indexOf(end,i);
if(i<0||j<i)throw Error('Missing native text section');
const work=fs.mkdtempSync(path.resolve('work/text-versions-')),outputs=[];
const encode=root=>ascii85Lines(Buffer.from(writeTypedTxt2(root),'latin1'));
for(const version of [11,13,14]){
  const schema=textSchemaFromFile(file);
  for(const root of [schema.root,schema.undoRoot])root.get('98').set('0',version);
  const section=`${start}\r/AI11TextDocument : /ASCII85Decode ,\r${encode(schema.root)}\r${schema.rulerOrigin.join(' ')} /RulerOrigin ,\r;\r/AI11UndoFreeTextDocument : /ASCII85Decode ,\r${encode(schema.undoRoot)}\r;\r${end}`;
  const stream=Buffer.from(original.slice(0,i)+section+original.slice(j+end.length),'latin1');
  const output=await attachNative(bytes,stream);
  const check=readAiBytes(output);
  assert.equal(textSchemaFromFile(check).root.get('98').get('0'),version);
  assert.deepEqual(check.document.text.stories.map(s=>s.text),file.document.text.stories.map(s=>s.text));
  const destination=path.join(work,`text-engine-${version}.ai`);
  fs.writeFileSync(destination,output,{flag:'wx'});outputs.push(destination);
}
fs.writeFileSync(path.join(work,'manifest.json'),JSON.stringify({input:path.resolve(input),illustratorVerified:false,outputs},null,2));
console.log(JSON.stringify({work,outputs},null,2));

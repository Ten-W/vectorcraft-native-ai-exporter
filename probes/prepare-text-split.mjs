// Isolate body serialization from setup/text-engine serialization using synthetic local data.
import fs from 'node:fs';
import path from 'node:path';
import { readAiBytes } from 'ai-file';
import { attachNative, decodeImages } from '../independent-export.mjs';
import { nativeStream } from '../native/stream.mjs';
import { fixture } from './fixture.mjs';
const refBytes=fs.readFileSync(process.argv[2]),ref=readAiBytes(refBytes);
const work=fs.mkdtempSync(path.resolve('work/text-split-'));
const schema={root:JSON.parse(JSON.stringify(ref.document.text.root,(k,v)=>v instanceof Map?Object.fromEntries(v):v)),rulerOrigin:ref.document.text.rulerOrigin};
const source=fixture(),own=nativeStream(source,decodeImages(source),{},schema).bytes;
function sections(bytes){const s=Buffer.from(bytes).toString('latin1');const start=s.indexOf('%%EndSetup')+10;const end=s.indexOf('%%PageTrailer',start);if(start<10||end<start)throw Error('Missing PGF boundaries');return {head:s.slice(0,start),body:s.slice(start,end),tail:s.slice(end)};}
const a=sections(ref.container.stream),b=sections(own);
fs.writeFileSync(path.join(work,'body-control.ai'),await attachNative(refBytes,Buffer.from(a.head+b.body+a.tail,'latin1')));
fs.writeFileSync(path.join(work,'setup-control.ai'),await attachNative(refBytes,Buffer.from(b.head+a.body+b.tail,'latin1')));
fs.writeFileSync(path.join(work,'complete-control.ai'),await attachNative(refBytes,own));
const previous=fs.readFileSync('work/controls-JswMfU/check-controls.jsx','utf8').replace(/^\ufeff/,'');
const cases=['body-control.ai','setup-control.ai','complete-control.ai'].map(n=>path.join(work,n).replace(/\\/g,'/'));
const prefix=`var CASES=${JSON.stringify(cases)};var REPORT=${JSON.stringify(path.join(work,'split-report.json').replace(/\\/g,'/'))};`;
fs.writeFileSync(path.join(work,'check-split.jsx'),'\ufeff'+previous.replace(/^var CASES=.*?;var REPORT=.*?;/,prefix));
console.log(JSON.stringify({work,script:path.join(work,'check-split.jsx')},null,2));

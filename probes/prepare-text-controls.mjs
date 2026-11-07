// Developer experiments, using only a local synthetic reference for engine-resource isolation.
import fs from 'node:fs';
import path from 'node:path';
import { readAiBytes, findArt, setText, serializeAiStream } from 'ai-file';
import { attachNative, decodeImages } from '../independent-export.mjs';
import { nativeStream } from '../native/stream.mjs';
import { fixture } from './fixture.mjs';
const sourcePath=process.argv[2];if(!sourcePath)throw Error('Pass synthetic reference.ai');
const referenceBytes=fs.readFileSync(sourcePath),reference=readAiBytes(referenceBytes);
const work=fs.mkdtempSync(path.resolve('work/text-controls-'));
const textArt=findArt(reference.document,a=>a.type==='text'&&reference.document.text?.stories[a.storyIndex]?.text.includes('中文'));
if(!textArt)throw Error('Reference has no Chinese text');
setText(reference.document,textArt,'中文尺寸独立改写测试');
fs.writeFileSync(path.join(work,'text-edit-control.ai'),await attachNative(referenceBytes,serializeAiStream(reference.document)));
const pristine=readAiBytes(referenceBytes);
const schema={root:JSON.parse(JSON.stringify(pristine.document.text.root,(k,v)=>v instanceof Map?Object.fromEntries(v):v)),rulerOrigin:pristine.document.text.rulerOrigin};
const source=fixture();
source.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0].text='中文尺寸独立新建';
const native=nativeStream(source,decodeImages(source),{},schema);
fs.writeFileSync(path.join(work,'text-resources-control.ai'),await attachNative(referenceBytes,native.bytes));
// Reuse the already-reviewed two-file audit body with only its synthetic inputs/report changed.
const previous=fs.readFileSync(process.argv[3] || 'work/controls-JswMfU/check-controls.jsx','utf8').replace(/^\ufeff/,'');
const cases=['text-edit-control.ai','text-resources-control.ai'].map(n=>path.join(work,n).replace(/\\/g,'/'));
const prefix=`var CASES=${JSON.stringify(cases)};var REPORT=${JSON.stringify(path.join(work,'text-controls-report.json').replace(/\\/g,'/'))};`;
const script=previous.replace(/^var CASES=.*?;var REPORT=.*?;/,prefix);
fs.writeFileSync(path.join(work,'check-text-controls.jsx'),'\ufeff'+script);
console.log(JSON.stringify({work,script:path.join(work,'check-text-controls.jsx')},null,2));

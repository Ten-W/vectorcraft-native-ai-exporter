// Font files stay on the verification machine. No Adobe engine is used to shape this test text.
import fs from 'node:fs';
import path from 'node:path';
import * as fontkit from 'fontkit';
import {readAiBytes} from 'ai-file';
import {textSchemaFromFile} from '../native/txt2.mjs';
import {nativeStream} from '../native/stream.mjs';
import {attachNative,decodeImages} from '../independent-export.mjs';
import {fixture} from './fixture.mjs';
const reference=fs.readFileSync(process.argv[2]),ref=readAiBytes(reference);
const schema=textSchemaFromFile(ref),source=fixture();
const chinese=source.document.layers[0].kind.children[0].kind.children[0].kind.children[0];chinese.kind.runs[0].text='中文尺寸全新文字';
const objects=[];function walk(ns){for(const n of ns){if(n.kind.type==='text')objects.push(n);if(n.kind.children)walk(n.kind.children);}}walk(source.document.layers);
const fonts={MicrosoftYaHei:fontkit.openSync('C:/Windows/Fonts/msyh.ttc').fonts.find(f=>f.postscriptName==='MicrosoftYaHei'),ArialMT:fontkit.openSync('C:/Windows/Fonts/arial.ttf')};
schema.layouts=objects.map(n=>{
 const run=n.kind.runs[0],font=fonts[run.style.font_family==='Arial'?'ArialMT':'MicrosoftYaHei'];
 const text=n.kind.runs.map(r=>r.text).join('')+' ',shape=font.layout(text),positions=[0];
 for(const p of shape.positions)positions.push(positions.at(-1)+p.xAdvance*run.style.size/font.unitsPerEm);
 if(shape.glyphs.length!==text.length)throw Error('Ligatures/complex text not covered in this diagnostic');
 return{glyphs:shape.glyphs.map(g=>g.id),positions};
});
const work=fs.mkdtempSync(path.resolve('work/shaped-control-'));
const native=nativeStream(source,decodeImages(source),{},schema).bytes;
const input=path.join(work,'shaped.ai');fs.writeFileSync(input,await attachNative(reference,native));
console.log(JSON.stringify({work,input},null,2));

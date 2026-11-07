// Objective checks for the additional synthetic scene after real Illustrator save/reopen.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {PNG} from 'pngjs';import {readAiBytes} from 'ai-file';
const root=process.argv[2];if(!root)throw Error('Pass extended scene work directory');
const report=JSON.parse(fs.readFileSync(path.join(root,'report.json'),'utf8'));assert.equal(report.passed,true,JSON.stringify(report));
const before=PNG.sync.read(fs.readFileSync(path.join(root,'before.png'))),after=PNG.sync.read(fs.readFileSync(path.join(root,'after.png'))),source=PNG.sync.read(fs.readFileSync(path.join(root,'expected.png')));
assert.deepEqual([before.width,before.height,after.width,after.height],[1000,1500,1000,1500]);
const rgb=(p,x,y)=>{const i=(y*p.width+x)*4,a=p.data[i+3]/255;return [...p.data.subarray(i,i+3)].map(v=>v*a+255*(1-a));};
function near(p,x,y,expected,label,tolerance=12){const actual=rgb(p,x,y);assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=tolerance),`${label} (${x},${y}): ${actual} instead of ${expected}`);}
for(const p of [before,after]){
 for(const [x,y] of [[353,680],[577,680],[475,1250],[815,1230],[865,1230],[815,1270],[865,1270],[120,1390],[40,1390],[307,1380],[298,1380],[340,1380],[590,1360]])near(p,x,y,rgb(source,x,y),'Mask/clip/appearance');
 for(const [x0,y0,x1,y1] of [[50,1220,190,1290],[250,1220,390,1290]])for(let y=y0;y<=y1;y+=10)for(let x=x0;x<=x1;x+=10)near(p,x,y,rgb(source,x,y),'Gradient');
 for(const [x,y] of [[35,1465],[90,1465],[200,1465],[280,1465],[400,1465],[450,1446],[490,1487],[550,1465],[600,1446],[640,1487],[710,1465],[750,1446]])near(p,x,y,rgb(source,x,y),'Transparent gradient/layer/gradient stroke');
 let painted=0,blank=0;for(let y=1220;y<1290;y++)for(let x=570;x<760;x++){const c=rgb(p,x,y);if(c[0]<220)painted++;else blank++;}assert.ok(painted>200&&blank>200,'Text opacity mask did not render letters');
 if(report.before.gray){near(p,800,1370,[255,255,255],'White Gray ink');near(p,850,1370,[128,128,128],'Half Gray ink');}
}
let changed=0;for(let i=0;i<before.data.length;i++)if(Math.abs(before.data[i]-after.data[i])>2)changed++;assert.ok(changed<50,`Save/reopen changed ${changed} channels`);
const native=Buffer.from(readAiBytes(fs.readFileSync(path.join(root,'saved.ai'))).container.stream).toString('latin1');assert.ok((native.match(/AI9_Mask/g)||[]).length>=6,'Native nested/text/image masks lost');assert.ok((native.match(/AI5_BeginRaster/g)||[]).length>=1,'Native mask image lost');assert.match(native,/StrokeOffsetInside/);assert.match(native,/BSArrowEndSymbol/);console.log('Extended Illustrator properties, gradients, nested/text/image masks, clipping, appearance pixels and native resources passed.');

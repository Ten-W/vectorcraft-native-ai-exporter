// Checks the real Illustrator report and its exported pixels, not a third-party parser alone.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {PNG} from 'pngjs';import {readAiBytes} from 'ai-file';
const root=process.argv[2];if(!root)throw Error('Pass advanced work directory');
const report=JSON.parse(fs.readFileSync(path.join(root,'report.json'),'utf8'));assert.equal(report.passed,true,JSON.stringify(report));
const before=PNG.sync.read(fs.readFileSync(path.join(root,'before.png'))),after=PNG.sync.read(fs.readFileSync(path.join(root,'after.png')));assert.equal(before.width,1000);assert.equal(before.height,980);assert.deepEqual([after.width,after.height],[1000,980]);
const at=(p,x,y)=>[...p.data.subarray((y*p.width+x)*4,(y*p.width+x)*4+3)];
for(const p of [before,after])for(const [name,x,y,color] of [['clip outside',10,360,[255,255,255]],['clip inside',40,400,[230,26,26]],['compound hole',260,410,[255,255,255]],['gray mask',430,410,[140,166,230]],['inverted mask',560,410,[83,121,217]],['multi fill',420,260,[107,56,133]]])assert.ok(at(p,x,y).every((v,i)=>Math.abs(v-color[i])<=10),`${name}: ${at(p,x,y)} versus ${color}`);
let changed=0;for(let i=0;i<before.data.length;i++)if(Math.abs(before.data[i]-after.data[i])>2)changed++;assert.ok(changed<50,`Saving/reopening changed ${changed} pixel channels`);console.log('Illustrator advanced edit/save/reopen report and clipping/mask/multi-appearance pixels passed.');

const native=Buffer.from(readAiBytes(fs.readFileSync(path.join(root,'saved.ai'))).container.stream).toString('latin1');assert.equal((native.match(/AI9_Mask/g)||[]).length,2);assert.ok((native.match(/AI5_BeginGradient/g)||[]).length>=2);assert.match(native,/Stack Style Filter/);console.log('Saved Illustrator native resources retain both opacity masks, gradients and appearance stacks.');

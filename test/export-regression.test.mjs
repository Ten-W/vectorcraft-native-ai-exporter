import test from 'node:test';import assert from 'node:assert/strict';
import {parseAiStream} from 'ai-file';
import {fixture} from '../probes/fixture.mjs';
import {nativeStream} from '../native/stream.mjs';
import {decodeImages} from '../independent-export.mjs';
import {strokeAttributes} from '../native/stroke-attributes.mjs';
import {inspectFonts} from '../native/system-fonts.mjs';
import {checkKnownGlyphs} from '../native/font-check.mjs';

test('explicit object lock and visibility states do not leak into siblings',()=>{
 const d=fixture(),nodes=d.document.layers[0].kind.children[0].kind.children[0].kind.children;
 nodes[0].locked=true;nodes[0].visible=false;
 const parsed=parseAiStream(nativeStream(d,decodeImages(d)).bytes);
 const actual=parsed.layers[0].children[0].children[0].children;
 assert.equal(actual[0].locked,true);assert.equal(actual[0].hidden,true);
 assert.equal(actual[1].locked,false);assert.equal(actual[1].hidden,false);
 const raw=nativeStream(d,decodeImages(d)).bytes.toString('latin1');assert.match(raw,/0 A\r0 Xw\r0 O/);
});
test('stroke attributes validate cap, join, dash and offset in the shared writer',()=>{
 assert.equal(strokeAttributes({cap:'Round',join:'Bevel',width:6,miter_limit:7,dash:{pattern:[12,4],offset:3}}),'1 J 2 j 6 w 7 M [12 4]3 d');
 for(const dash of [{pattern:[0,0]},{pattern:[-1,2]},{pattern:[1,2],align_corners:true}])assert.throws(()=>strokeAttributes({dash}),/虚线/);
 const d=fixture(),node=d.document.layers[0].kind.children[0].kind.children[0].kind.children[1];Object.assign(node.appearance.items[0],{cap:'Square',join:'Round',dash:{pattern:[10,5],offset:2}});
 assert.match(nativeStream(d,decodeImages(d)).bytes.toString('latin1'),/2 J 1 j 3 w 4 M \[10 5\]2 d/);
});
test('standalone font preflight discovers exact installed names and never substitutes unknown fonts',()=>{
 assert.doesNotThrow(()=>checkKnownGlyphs('SourceSans3-Regular','Text 123'));
 assert.throws(()=>checkKnownGlyphs('SourceSans3-Regular','中文'),/缺少字符/);
 const d=fixture(),style=d.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0].style;
 style.font_family='A-Font-That-Does-Not-Exist';assert.throws(()=>inspectFonts(d),/无法自动识别字体/);
 const report=inspectFonts(fixture());assert.equal(report.map['Arial|Regular'],'ArialMT');
 assert.ok(report.fonts.every(f=>typeof f.availableLocally==='boolean'));
 if(report.fonts.find(f=>f.postScriptName==='ArialMT')?.availableLocally){
   const missing=fixture();assert.throws(()=>inspectFonts(missing,{'Microsoft YaHei|Regular':'ArialMT'}),/缺少字符/);
   const custom=fixture(),run=custom.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0];run.text='Readable';run.style.font_family='Arial';
   const auto=inspectFonts(custom);assert.equal(auto.map['Arial|Regular'],'ArialMT');
 }
});

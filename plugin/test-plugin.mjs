// The same WASM file used by VectorCraft; no host filesystem imports are permitted.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {textSchemaFromFile,writeTypedTxt2} from '../native/txt2.mjs';
import {readAiBytes,parseAiStream,rasterToRgba} from 'ai-file';
import {fixture} from '../probes/fixture.mjs';
import {exportNative} from '../export-native.mjs';
import {extendedFixture} from '../probes/extended-fixture.mjs';
import {advancedFixture} from '../probes/advanced-fixture.mjs';
import {regressionFixture} from '../probes/regression-fixture.mjs';
const file=process.argv[2];if(!file)throw Error('Pass exporter.wasm');
const module=await WebAssembly.compile(fs.readFileSync(file));
assert.deepEqual(WebAssembly.Module.imports(module),[]);
const utf8=new TextEncoder(),decode=new TextDecoder();
async function run(source,settings={}){
  const {exports:e}=await WebAssembly.instantiate(module,{});
  assert.equal(e.vc_abi_version(),1);
  const read=packed=>{const p=Number(packed&0xffffffffn),len=Number(packed>>32n);assert.ok(p+len<=e.memory.buffer.byteLength);return JSON.parse(decode.decode(new Uint8Array(e.memory.buffer,p,len)));};
  const manifest=read(e.vc_manifest());
  assert.equal(manifest.kind,'exporter');
  assert.match(manifest.name,/可编辑/);
  assert.deepEqual(manifest.params,{});
  function alloc(value){const bytes=utf8.encode(JSON.stringify(value)),ptr=e.vc_alloc(bytes.length);assert.ok(ptr);new Uint8Array(e.memory.buffer,ptr,bytes.length).set(bytes);return[ptr,bytes.length];}
  const input=alloc(source),params=alloc({font_map:'{}',...settings});
  return read(e.vc_run(...input,...params));
}
const source=fixture(),result=await run(source);assert.equal(result.error,undefined);
const native=Buffer.from(result.dataBase64,'base64'),parsed=parseAiStream(native);
assert.doesNotMatch(native.toString('latin1'),/~\r%\s*>/);
assert.deepEqual(parsed.warnings,[]);assert.equal(parsed.artboards.length,2);
assert.equal(parsed.text.stories[0].text,'中文尺寸\r');
assert.equal(parsed.text.stories[0].chars[0].style.size,24);
assert.equal(parsed.text.stories[0].chars[0].style.font.postScriptName,'MicrosoftYaHei');
assert.equal(parsed.layers.length,2);
const work=path.resolve('work/plugin-smoke');fs.mkdirSync(work,{recursive:true});
const regression=await run(regressionFixture());assert.equal(regression.error,undefined);
const regressionBytes=Buffer.from(regression.dataBase64,'base64'),regressionParsed=parseAiStream(regressionBytes);
assert.deepEqual(regressionParsed.warnings,[]);
const all=[];function walk(n){all.push(n);for(const c of n.children||[])walk(c);}regressionParsed.layers.forEach(walk);
assert.equal(all.filter(n=>n.type==='raster').length,3);
const pictures=all.filter(n=>n.type==='raster');
const pngPixels=rasterToRgba(pictures[0],regressionParsed.source);
assert.deepEqual([pngPixels.width,pngPixels.height],[2,2]);
assert.deepEqual([...pngPixels.rgba],[255,0,0,255,0,255,0,128,0,0,255,255,255,255,0,64]);
for(const picture of pictures){const pixels=rasterToRgba(picture,regressionParsed.source);assert.deepEqual([pixels.width,pixels.height],[2,2]);assert.ok(pixels.rgba.some(x=>x!==0));}
assert.equal(all.find(n=>n.name==='VC_10').locked,true);assert.equal(all.find(n=>n.name==='VC_11').locked,false);
assert.equal(all.find(n=>n.name==='VC_12').hidden,true);assert.equal(all.find(n=>n.name==='VC_13').hidden,false);
assert.match(regressionBytes.toString('latin1'),/1 J 2 j 6 w 7 M \[12 4\]3 d/);
fs.writeFileSync(path.join(work,'regression.ai'),regressionBytes);fs.writeFileSync(path.join(work,'regression.vectorcraft'),JSON.stringify(regressionFixture()));
fs.writeFileSync(path.join(work,'basic.ai'),native);fs.writeFileSync(path.join(work,'basic.vectorcraft'),JSON.stringify(source));
const children=source.document.layers[0].kind.children[0].kind.children[0].kind.children;
const arrow=children[1];arrow.kind.path.subpaths[0].anchors=[{p:[40,150]},{p:[160,150]}];
Object.assign(arrow.appearance.items[0],{end_arrow:'Triangle',arrow_align:'Tip',arrow_scale:[100,100]});
const circle=structuredClone(arrow);circle.id=9;circle.name='Circle arrows';circle.kind.path.subpaths[0].anchors=[{p:[40,190]},{p:[160,190]}];Object.assign(circle.appearance.items[0],{start_arrow:'Circle',end_arrow:'Circle'});children.push(circle);
const arrows=await run(source);assert.equal(arrows.error,undefined);const arrowBytes=Buffer.from(arrows.dataBase64,'base64');
assert.deepEqual(parseAiStream(arrowBytes).warnings,[]);assert.match(arrowBytes.toString('latin1'),/BSArrowEndSymbol/);
fs.writeFileSync(path.join(work,'arrows.ai'),arrowBytes);fs.writeFileSync(path.join(work,'arrows.vectorcraft'),JSON.stringify(source));
for(const [family,style,ps] of [['Source Sans 3','Regular','SourceSans3-Regular'],['Source Sans 3','Bold','SourceSans3-Bold'],['Inter','Regular','Inter-Regular'],['SimSun','Regular','SimSun']]){
  const d=fixture();Object.assign(d.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0].style,{font_family:family,font_style:style});
  d.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0].text="Font test";
  const result=await run(d,{font_map:''});assert.equal(result.error,undefined);
  assert.equal(parseAiStream(Buffer.from(result.dataBase64,'base64')).text.stories[0].chars[0].style.font.postScriptName,ps);
}
children[0].kind.runs[0].style.font_family='Unknown';assert.match((await run(source)).error,/无法自动识别字体「Unknown」/);
assert.equal((await run(source,{font_map:JSON.stringify({'Unknown|Regular':'ExplicitFont'})})).error,undefined);
assert.match((await run(source,{font_map:'broken'})).error,/映射格式不正确/);
assert.match((await run(source,{font_map:JSON.stringify({'Unused|Regular':''})})).error,/内部名称无效/);
const missing=fixture();missing.images.sample={mime:'image/png',blob:[0,10000]};assert.match((await run(missing)).error,/未向插件提供.*图片.*Run-Independent/);
const missingGlyph=fixture();missingGlyph.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0].style.font_family='Source Sans 3';assert.match((await run(missingGlyph)).error,/缺少字符/);
for(const align of ['Inside','Outside']){
  const d=fixture();d.document.layers[0].kind.children[0].kind.children[0].kind.children[1].appearance.items[0].align=align;
  const result=await run(d);assert.match(result.error,/内侧或外侧描边/);assert.equal(result.dataBase64,undefined);
  const node=d.document.layers[0].kind.children[0].kind.children[0].kind.children[1];
  node.kind.path.subpaths=[{closed:true,anchors:[{p:[40,100]},{p:[160,100]},{p:[160,180]},{p:[40,180]}]}];
  const closed=await run(d);assert.equal(closed.error,undefined);
  const raw=Buffer.from(closed.dataBase64,'base64').toString('latin1');
  assert.ok(raw.includes(`${align==='Inside'?1:0} /Bool (StrokeOffsetInside)`));
  assert.ok(raw.includes('%_40 -100 m\r%_160 -100 L\r%_160 -180 L\r%_40 -180 L\r%_40 -100 L\r%_n\r'));
}
await exportNative(path.join(work,'basic.vectorcraft'),path.join(fs.mkdtempSync(path.join(work,'standalone-')),'output.ai'),{},file);
console.log('Import-free WASM: Chinese, font/size, boards, layers, PNG, native arrows and failure guards passed. Not Illustrator acceptance.');

const advanced=await run(advancedFixture());assert.equal(advanced.error,undefined);const advancedBytes=Buffer.from(advanced.dataBase64,'base64'),rawAdvanced=advancedBytes.toString('latin1');
for(const marker of ['%AI5_BeginGradient','(AI9_Mask)','(VC Arrow Diamond)','W\rn'])assert.ok(rawAdvanced.includes(marker),marker);
assert.equal(parseAiStream(advancedBytes).text.stories.length,3);
assert.match(rawAdvanced,/\(opacity-mask\) [\s\S]{0,150}%_\/Mask :/);
assert.match(rawAdvanced,/VC Arrow CircleOpen/);
fs.writeFileSync(path.join(work,'advanced.ai'),advancedBytes);
for(const mutate of [d=>{d.document.layers[0].kind.children.find(n=>n.name==='after-transparency').appearance.items[0].effects=[{type:'unsupported'}]},d=>{d.document.layers[0].kind.clip=true},d=>{d.document.layers[0].kind.children[1].kind.area={verticalAlign:"center"}},d=>{d.document.layers[0].kind.children[4].appearance.items[0].paint.gradient.stops[0].opacity=1.5}]){const d=advancedFixture();mutate(d);const r=await run(d);assert.ok(r.error);assert.equal(r.dataBase64,undefined);}
console.log('Advanced native structures and unsupported-combination guards passed. Illustrator rendering still requires acceptance.');

const extended=await run(extendedFixture());assert.equal(extended.error,undefined);const extendedBytes=Buffer.from(extended.dataBase64,'base64');fs.writeFileSync(path.join(work,'extended.ai'),extendedBytes);const extendedText=writeTypedTxt2(textSchemaFromFile(readAiBytes(extendedBytes)).root);for(const marker of ['/1 2','/10 17.0'])assert.ok(extendedText.includes(marker),marker);for(const marker of [' Bm','(mask-letters)'])assert.ok(extendedBytes.toString('latin1').includes(marker),marker);console.log('Extended text, ellipse, mask and appearance structures emitted; real Illustrator validation required.');

const arrayPoints=extendedFixture(),geom=arrayPoints.document.layers[0].kind.children.find(n=>n.name==='ellipse-focal-gradient').appearance.items[0].paint.geom;for(const key of ['start','end','focal'])geom[key]=[geom[key].x,geom[key].y];assert.equal((await run(arrayPoints)).dataBase64,extended.dataBase64,'Point arrays and actual host point objects must export identically');

assert.match(extendedBytes.toString('latin1'),/1 Bb\r/);assert.match(extendedBytes.toString('latin1'),/ Xm\r/);assert.match(extendedBytes.toString('latin1'),/0.2 6 50 0 %_Bs/);

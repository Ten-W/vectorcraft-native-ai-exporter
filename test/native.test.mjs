import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiStream, readAiBytes } from 'ai-file';
import { PDFDocument } from 'pdf-lib';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import vm from 'node:vm';
import { PNG } from 'pngjs';
import { nativeStream,ascii85Lines } from '../native/stream.mjs';
import { readVectorCraft, attachNative, decodeImages, convert } from '../independent-export.mjs';
import { fixture } from '../probes/fixture.mjs';
import {parseTypedTxt2,writeTypedTxt2,real} from '../native/txt2.mjs';

test('bundled and common system fonts resolve without manual mappings',()=>{
  const source=fixture();
  const style=source.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0].style;
  for(const [family,variant,ps] of [['Source Sans 3','Regular','SourceSans3-Regular'],['Source Sans 3','Italic','SourceSans3-It'],['Microsoft YaHei','Bold','MicrosoftYaHei-Bold'],['SimSun','Regular','SimSun']]){
    Object.assign(style,{font_family:family,font_style:variant});source.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0].text="Font test";
    const parsed=parseAiStream(nativeStream(source,decodeImages(source)).bytes);
    assert.equal(parsed.text.stories[0].chars[0].style.font.postScriptName,ps);
  }
});

test('inside and outside strokes reject open paths and preserve native closed-path alignment',()=>{
  for(const align of ['Inside','Outside']){
    const d=fixture();d.document.layers[0].kind.children[0].kind.children[0].kind.children[1].appearance.items[0].align=align;
    assert.throws(()=>nativeStream(d),/内侧或外侧描边/);
    const node=d.document.layers[0].kind.children[0].kind.children[0].kind.children[1];
    node.kind.path.subpaths=[{closed:true,anchors:[{p:[40,100]},{p:[160,100]},{p:[160,180]},{p:[40,180]}]}];
    const bytes=nativeStream(d,decodeImages(d)).bytes.toString('latin1');
    assert.match(bytes,/\(Adobe Stroke Offset\) 1 0 \/Filter/);
    assert.ok(bytes.includes(`${align==='Inside'?1:0} /Bool (StrokeOffsetInside)`));
    assert.ok(bytes.includes('%_40 -100 m\r%_160 -100 L\r%_160 -180 L\r%_40 -180 L\r%_40 -100 L\r%_n\r'));
    assert.match(bytes,/1 \(VC Stroke Alignment 5\) XW/);
  }
});

test('native Unicode stories, nested group tree, font, artboard positions and Bezier geometry survive another encoding', async()=>{
  const source=fixture(), native=nativeStream(source,decodeImages(source)), parsed=parseAiStream(native.bytes);
  assert.deepEqual(native.counts,{layer:2,group:2,path:1,text:2,image:1});
  assert.equal(parsed.layers[0].children[0].children[0].children[0].type,'text');
  assert.equal(parsed.text.stories[0].text,'中文尺寸\r');
  assert.equal(parsed.text.stories[0].chars[0].style.font.postScriptName,'MicrosoftYaHei');
  assert.equal(parsed.text.stories[0].chars[0].style.size,24);
  const typed=parseTypedTxt2((await import('ai-file')).parseDictBlock(parsed.statements,parsed.statements.findIndex(s=>s.op===':'&&s.args.some(a=>a.t==='n'&&a.v==='AI11TextDocument'))).roots[0].binary);
  const fontRecord=typed.get('0').get('1').get('0')[0].get('0');
  assert.equal([...fontRecord.keys()][0],'99');
  assert.equal([...typed.keys()][0],'98');
  const story=typed.get('1').get('1')[0];
  assert.deepEqual([...story.get('0').get('6').get('0')[0].get('0').get('0').keys()],['0','5','6']);
  assert.equal(story.get('1').has('2'),false);
  assert.deepEqual(parsed.artboards.map(b=>[b.left,b.top,b.right,b.bottom]),[[0,0,400,-240],[440,-20,640,-180]]);
  const curve=parsed.layers[0].children[0].children[0].children[1].segments[1];
  assert.equal(curve.kind,'curve'); assert.equal(curve.x1,40); assert.equal(curve.y1,-80);
  const preview=await PDFDocument.create();preview.addPage([400,240]);preview.addPage([200,160]);
  const bytes=await attachNative(await preview.save(),new Uint8Array(native.bytes));
  const file=readAiBytes(bytes);
  assert.equal(file.container.pageCount,2);
  assert.equal(file.container.compression,'deflate');
  assert.equal(file.document.text.stories[0].text,'中文尺寸\r');
  assert.equal(file.document.layers[0].children[0].children[0].type,'group');
});

test('unsupported arrow shapes, opacity, and fonts fail instead of flattening or substitution',()=>{
  const d=fixture(), children=d.document.layers[0].kind.children[0].kind.children[0].kind.children;
  children[1].appearance.items[0].end_arrow='UnsupportedShape';
  assert.throws(()=>nativeStream(d),/arrow shape/);
  delete children[1].appearance.items[0].end_arrow;
  children[0].opacity=0.5;assert.throws(()=>nativeStream(d),/transparency/);
  delete children[0].opacity;
  children[0].kind.runs[0].style.font_family='Unknown font';
  assert.throws(()=>nativeStream(d),/font mapping/);
  assert.doesNotThrow(()=>nativeStream(d,decodeImages(d), {'Unknown font|Regular':'ExplicitPostScriptFont'}));
});

test('canvas offset is applied after rotated and scaled point-text transforms',()=>{
  for(const xf of [[0,1,-1,0,30,60],[2,0,0,.5,30,60]]){
    const source=fixture();
    source.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.xf=xf;
    const parsed=parseAiStream(nativeStream(source,decodeImages(source)).bytes);
    const frame=parsed.text.frames[0],[a,b,c,d,tx,ty]=frame.matrix,[x,y]=frame.anchor;
    const origin=parsed.text.rulerOrigin;
    assert.deepEqual([a*x+c*y+tx-origin[0],b*x+d*y+ty-origin[1]],[30,60]);
    assert.deepEqual([a,b,c,d],xf.slice(0,4));
  }
});

test('native arrow styles retain editable source paths and reference self-generated symbols',()=>{
  const source=fixture(),stroke=source.document.layers[0].kind.children[0].kind.children[0].kind.children[1].appearance.items[0];
  Object.assign(stroke,{start_arrow:'Circle',end_arrow:'Triangle',arrow_align:'Tip',arrow_scale:[75,125]});
  const result=nativeStream(source,decodeImages(source)),text=result.bytes.toString('latin1');
  assert.match(text,/75 \/Real \(BSArrowBeginScale\)/);assert.match(text,/125 \/Real \(BSArrowEndScale\)/);
  assert.match(text,/VC Arrow Circle\) \/SymbolArt/);assert.match(text,/VC Arrow Triangle\) \/SymbolArt/);
  assert.match(text,/%_10 -110 m/);assert.match(text,/1 \(VC Arrow Style 5\) XW/);
  assert.deepEqual(parseAiStream(result.bytes).warnings,[]);
  stroke.arrow_scale=[0,100];assert.throws(()=>nativeStream(source,decodeImages(source)),/arrow scales/);
});

test('Txt2 real values remain real even when their numeric value is an integer',()=>{
  const t=parseTypedTxt2(Buffer.from('/0 << /0 1 /1 24.0 /2 [ 1.0 0.0 30.0 ] /3 (literal 24.0) >>','latin1'));
  const serialized=writeTypedTxt2(t);
  assert.match(serialized,/\/0 1 \/1 24\.0/);
  assert.match(serialized,/\[ 1\.0 0\.0 30\.0 \]/);
  t.get('0').set('1',real(36));
  assert.match(writeTypedTxt2(t),/\/1 36\.0/);
  assert.equal(real(24*1.2).raw,'~VC_REAL~28.8');
});

test('large encoded text is inserted literally, including replacement metacharacters',()=>{
  const d=fixture();const text=Array.from({length:6000},(_,i)=>String.fromCharCode(0x4e00+(i*37)%2000)).join('');
  d.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0].text=text;
  const native=nativeStream(d,decodeImages(d));
  assert.match(native.bytes.toString('latin1'),/\$[&`']/);
  const parsed=parseAiStream(native.bytes);
  assert.deepEqual(parsed.warnings,[]);
  assert.equal(parsed.text.stories[0].text,text+'\r');
});

test('ASCII85 line wrapping never splits the Adobe end marker',()=>{
  for(let size=1;size<=400;size++){
    const encoded=ascii85Lines(Buffer.alloc(size,1));
    assert.ok(encoded.endsWith('~>'));assert.doesNotMatch(encoded,/~\r/);
    assert.ok(encoded.split('\r').every(line=>line.startsWith('% ')));
  }
});

test('gzip and external image blobs are decoded with range checking',()=>{
  const payload=fixture();payload.images={picture:{mime:'image/png',blob:[0,4]}};
  const file=Buffer.concat([Buffer.from(JSON.stringify(payload)),Buffer.from('\n\0VCBLOBS\0'),Buffer.from([1,2,3,4])]);
  assert.equal(readVectorCraft(zlib.gzipSync(file)).images.picture.data,'AQIDBA==');
  payload.images.picture.blob=[2,8];
  assert.throws(()=>readVectorCraft(Buffer.concat([Buffer.from(JSON.stringify(payload)),Buffer.from('\n\0VCBLOBS\0'),Buffer.from([1,2,3,4])])),/blob range/);
});

test('verification config accepts paths but never executes configuration as code',()=>{
  const jsx=fs.readFileSync(new URL('../probes/verify-illustrator.jsx',import.meta.url),'utf8');
  new vm.Script(jsx); // JSX is ExtendScript source, not a Node module.
  function check(raw){
    let report='',opens=0;
    function File(p){if(!(this instanceof File))return new File(p);this.fsName=String(p);this.parent='C:/probe';this.open=()=>true;this.close=()=>{};this.read=()=>raw;this.write=s=>{report=s;};}
    const app={version:'mock',userInteractionLevel:0,open(){opens++;throw Error('Stopped before real application');}};
    vm.runInNewContext(jsx,{File,app,$:{fileName:'C:/probe/verify.jsx'},UserInteractionLevel:{DONTDISPLAYALERTS:1},SaveOptions:{}},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}});
    return {opens,report:JSON.parse(report)};
  }
  const settings={input:'C:/probe/input.ai',saved:'C:/probe/saved.ai',report:'C:/probe/report.json'};
  assert.equal(check(JSON.stringify(settings)).opens,1);
  assert.throws(()=>check('{"input":"C:/a.ai","saved":"C:/b.ai","report":(function(){throw Error("executed")})()}'),/Invalid verification settings/);
  assert.throws(()=>check(JSON.stringify({...settings,saved:settings.input})),/overwrite input/);
});

const cli=process.env.VECTORCRAFT_CLI || 'C:/Program Files/VectorCraft/vectorcraft-cli.exe';
test('VectorCraft independently reads native Chinese, nested named groups and matching pixels', {skip:!fs.existsSync(cli)}, async()=>{
  const root=path.resolve('work');fs.mkdirSync(root,{recursive:true});
  const work=fs.mkdtempSync(path.join(root,'native-integration-'));
  const source=path.join(work,'source.vectorcraft'),ai=path.join(work,'independent.ai'),back=path.join(work,'back.vectorcraft');
  fs.writeFileSync(source,JSON.stringify(fixture()));
  await convert(source,ai,cli);
  function run(args){const r=cp.spawnSync(cli,args,{encoding:'utf8',timeout:120000,windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout;}
  run(['convert',ai,back,'--editing-data']);
  const d=readVectorCraft(fs.readFileSync(back)).document;
  assert.equal(d.artboards.length,2);assert.equal(d.layers.length,2);
  const outer=d.layers[0].kind.children[0],inner=outer.kind.children[0];
  assert.equal(outer.name,'外组');assert.equal(inner.name,'内组');
  const text=inner.kind.children.find(n=>n.kind.type==='text');
  assert.equal(text.kind.runs.map(r=>r.text).join(''),'中文尺寸');
  assert.equal(text.kind.runs[0].style.font_family,'Microsoft YaHei');
  assert.equal(text.kind.runs[0].style.size,24);
  assert.equal(inner.kind.children.filter(n=>n.kind.type==='image').length,1);
  for(const [file,out] of [[source,'source.png'],[back,'back.png']])run(['convert',file,path.join(work,out)]);
  assert.deepEqual(PNG.sync.read(fs.readFileSync(path.join(work,'back.png'))).data,PNG.sync.read(fs.readFileSync(path.join(work,'source.png'))).data);
});

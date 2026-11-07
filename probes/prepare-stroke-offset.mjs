// One synthetic batch. This probe does not remove the production writer's alignment guard.
import fs from 'node:fs';import path from 'node:path';
import {fixture} from './fixture.mjs';import {nativeStream} from '../native/stream.mjs';
import {alignedStrokeStyle} from '../native/stroke-offset.mjs';
import {exportNative} from '../export-native.mjs';
import {readVectorCraft} from '../native/read-vectorcraft.mjs';
const work=fs.mkdtempSync(path.resolve('work/stroke-offset-'));
const wasm=process.argv[2],userSource=process.argv[3];
const files=[];
for(const align of ['Inside','Outside']){
 const d=fixture(),rect={id:5,name:align,appearance:{items:[{kind:'fill',paint:{type:'solid',color:{model:'rgb',r:0.8,g:0.8,b:0.8}}},{kind:'stroke',paint:{type:'solid',color:{model:'rgb',r:0.1,g:0.3,b:0.8}},width:8}]},kind:{type:'path',path:{subpaths:[{closed:true,anchors:[{p:[40,100]},{p:[160,100]},{p:[160,180]},{p:[40,180]}]}]}}};
 d.document.layers=[{id:1,name:'Alignment test',kind:{type:'layer',children:[rect]}}];d.document.artboards=[d.document.artboards[0]];
 let raw=nativeStream(d).bytes.toString('latin1');
 const record=alignedStrokeStyle(5,{...rect.appearance.items[1],align},rect.appearance.items[0],{number:String,quote:s=>'('+s+')',color:(c,stroke)=>`0 0 0 0 ${c.r} ${c.g} ${c.b} ${stroke?'XA':'Xa'}`});
 raw=raw.replace('%AI11_BeginTextDocument','%AI5_Begin_NonPrinting\r%AI9_BeginArtStyles\r'+record.style+'%AI9_EndArtStyles\r%AI5_End_NonPrinting--\r%AI11_BeginTextDocument');
 const shape='40 -100 m\r160 -100 L\r160 -180 L\r40 -180 L\r40 -100 L\rb\r';
 if(!raw.includes(shape))throw Error('Expected synthetic rectangle');
 raw=raw.replace(shape,'0 Ae\ru\rU\r0 0 Xd\r6 () XW\r%_40 -100 m\r%_160 -100 L\r%_160 -180 L\r%_40 -180 L\r%_40 -100 L\r%_n\r');
 const endToken='%_;\r',metaEnd=raw.indexOf(endToken,raw.indexOf('(AIArtName)'));if(metaEnd<0)throw Error('Expected rectangle metadata');
 const end=metaEnd+endToken.length;raw=raw.slice(0,end)+`1 (${record.name}) XW\r`+raw.slice(end);
 const input=path.join(work,align+'.ai'),saved=path.join(work,align+'-saved.ai');
 if(wasm){rect.appearance.items[1].align=align;const source=path.join(work,align+'.vectorcraft');fs.writeFileSync(source,JSON.stringify(d));await exportNative(source,input,{},path.resolve(wasm));}
 else fs.writeFileSync(input,Buffer.from(raw,'latin1'));
 files.push({align,input:input.replaceAll('\\','/'),saved:saved.replaceAll('\\','/')});
}
let userCase=null;
if(userSource){
 if(!wasm)throw Error('Pass the WASM module before a user document');
 const input=path.join(work,'design-copy.ai'),saved=path.join(work,'design-copy-saved.ai');
 await exportNative(path.resolve(userSource),input,{},path.resolve(wasm));
 const source=readVectorCraft(fs.readFileSync(userSource)),expected=[];let texts=0;
 function visit(n){if(n.kind?.type==='text')texts++;for(const st of n.appearance?.items||[]){if(st.kind!=='stroke'||st.paint?.type==='none'||!['Inside','Outside'].includes(st.align))continue;const points=n.kind.path.subpaths[0].anchors.map(a=>a.p);expected.push({name:n.name,width:st.width,align:st.align,geometric:[Math.min(...points.map(p=>p[0])),-Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),-Math.max(...points.map(p=>p[1]))]});}for(const c of n.kind?.children||[])visit(c);}source.document.layers.forEach(visit);
 userCase={input:input.replaceAll('\\','/'),saved:saved.replaceAll('\\','/'),expected,texts};
}
const report=path.join(work,'report.json').replaceAll('\\','/');
const verifier=fs.readFileSync('probes/verify-illustrator.jsx','utf8');const encoder=verifier.slice(verifier.indexOf('    function encode(v)'),verifier.indexOf('    var doc, old='));
const jsx=`(function(){${encoder}
var files=${JSON.stringify(files)},userCase=${JSON.stringify(userCase)},r={version:app.version,passed:false,cases:[]},doc,old=app.userInteractionLevel;
function write(){var f=new File(${JSON.stringify(report)});f.encoding='UTF-8';f.open('w');f.write(encode(r));f.close();}
function bounds(p){app.redraw();var b=p.visibleBounds;return [b[0],b[1],b[2],b[3]];}
function checkCorners(p){if(p.pathPoints.length!==4)throw Error('Expected four rectangle corners');for(var i=0;i<4;i++){var q=p.pathPoints[i];for(var j=0;j<2;j++)if(Math.abs(q.anchor[j]-q.leftDirection[j])>.01||Math.abs(q.anchor[j]-q.rightDirection[j])>.01)throw Error('Rectangle has unexpected curved handles');}}
function check(d,align){if(d.pathItems.length!==1)throw Error('Expected one editable path, got '+d.pathItems.length);var p=d.pathItems[0];checkCorners(p);var original=bounds(p),w=p.strokeWidth;p.strokeWidth=16;var grown=bounds(p);p.strokeWidth=w;var restored=bounds(p);p.translate(5,5);var moved=bounds(p);p.translate(-5,-5);var expected=align==='Inside'?[40,-100,160,-180]:[32,-92,168,-188];var expectedGrown=align==='Inside'?[40,-100,160,-180]:[24,-84,176,-196];var result={closed:p.closed,width:w,original:original,doubled:grown,restored:restored,moved:moved,expected:expected,expectedDoubled:expectedGrown};for(var i=0;i<4;i++){if(!p.closed||Math.abs(original[i]-expected[i])>.05||Math.abs(grown[i]-expectedGrown[i])>.05||Math.abs(moved[i]-expected[i]-5)>.05)throw Error('Native stroke alignment bounds mismatch: '+encode(result));}return result;}
function checkDesign(d){if(d.textFrames.length!==userCase.texts)throw Error('Design editable text count mismatch');var used={},out=[];for(var j=0;j<userCase.expected.length;j++){var e=userCase.expected[j],p=null;for(var k=0;k<d.pathItems.length;k++){var candidate=d.pathItems[k];if(used[k]||candidate.name!==e.name)continue;var g=candidate.geometricBounds,match=true;for(var z=0;z<4;z++)if(Math.abs(g[z]-e.geometric[z])>.05)match=false;if(match){p=candidate;used[k]=true;break;}}if(!p)throw Error('Design path not found: '+e.name);checkCorners(p);var b=bounds(p),w=p.strokeWidth;for(var z=0;z<4;z++){var expected=e.geometric[z]+(e.align==='Outside'?((z===0||z===3)?-w:w):0);if(Math.abs(b[z]-expected)>.05)throw Error('Design alignment mismatch: '+e.name);}if(Math.abs(w-e.width)>.05)throw Error('Design stroke width mismatch');if(e.align==='Inside'){p.strokeWidth=w*2;var grown=bounds(p);p.strokeWidth=w;for(var z=0;z<4;z++)if(Math.abs(grown[z]-b[z])>.05)throw Error('Design inside alignment lost after width edit');}out.push({name:e.name,width:w,bounds:b});}return {editableTexts:d.textFrames.length,alignedPaths:out};}
try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;for(var i=0;i<files.length;i++){var item=files[i],entry={align:item.align,stage:'opening'};r.cases.push(entry);write();doc=app.open(new File(item.input));entry.before=check(doc,item.align);entry.stage='saving';write();var options=new IllustratorSaveOptions();options.pdfCompatible=true;options.compressed=true;doc.saveAs(new File(item.saved),options);doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;doc=app.open(new File(item.saved));entry.after=check(doc,item.align);doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;entry.stage='complete';}
if(userCase){r.design={stage:'opening'};write();doc=app.open(new File(userCase.input));r.design.before=checkDesign(doc);r.design.stage='saving';write();var opts=new IllustratorSaveOptions();opts.pdfCompatible=true;opts.compressed=true;doc.saveAs(new File(userCase.saved),opts);doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;doc=app.open(new File(userCase.saved));r.design.after=checkDesign(doc);for(var board=0;board<doc.artboards.length;board++){doc.artboards.setActiveArtboardIndex(board);var png=new ExportOptionsPNG24();png.artBoardClipping=true;png.transparency=false;doc.exportFile(new File(userCase.saved+'-board-'+board+'.png'),ExportType.PNG24,png);}doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;r.design.stage='complete';}r.passed=true;}catch(e){r.error=String(e);r.line=e.line;}finally{if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);app.userInteractionLevel=old;write();}
})();`;
fs.writeFileSync(path.join(work,'check-stroke-offset.jsx'),'\ufeff'+jsx);console.log(JSON.stringify({work,script:path.join(work,'check-stroke-offset.jsx'),report},null,2));

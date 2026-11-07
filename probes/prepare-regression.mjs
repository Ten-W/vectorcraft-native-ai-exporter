// Reusable acceptance batch: one user-confirmed Illustrator run, synthetic documents only.
import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';
import {regressionFixture} from './regression-fixture.mjs';
import {exportNative} from '../export-native.mjs';
const wasm=path.resolve(process.argv[2]||'VectorCraft-Native-AI.wasm');
const work=fs.mkdtempSync(path.resolve('work/regression-'));
const source=path.join(work,'source.vectorcraft'),input=path.join(work,'standalone.ai'),host=path.join(work,'host.ai'),saved=path.join(work,'saved.ai'),report=path.join(work,'report.json');
fs.writeFileSync(source,JSON.stringify(regressionFixture()));await exportNative(source,input,{},wasm);
const cli=process.env.VECTORCRAFT_CLI||'C:/Program Files/VectorCraft/vectorcraft-cli.exe';
if(fs.existsSync(cli)){
 const commands=path.join(work,'commands.json');fs.writeFileSync(commands,JSON.stringify([{command:'plugin.install',params:{path:wasm}},{command:'document.export',params:{format:'plugin.tenw.native-ai',path:host}}]));
 cp.execFileSync(cli,['run','--in',source,'--commands',commands],{stdio:'pipe',timeout:60000,env:{...process.env,VECTORCRAFT_CONFIG_DIR:path.join(work,'profile')}});
 if(!fs.readFileSync(input).equals(fs.readFileSync(host)))throw Error('Host and standalone output differ');
 cp.execFileSync(cli,['convert',source,path.join(work,'expected.png')],{stdio:'pipe',timeout:60000});
}
const verifier=fs.readFileSync('probes/verify-illustrator.jsx','utf8'),encoder=verifier.slice(verifier.indexOf('    function encode(v)'),verifier.indexOf('    var doc, old='));
const json=p=>JSON.stringify(p.replaceAll('\\','/'));
const script=`(function(){${encoder}
var INPUT=${json(fs.existsSync(host)?host:input)},SAVED=${json(saved)},REPORT=${json(report)},PNG=${json(path.join(work,'illustrator.png'))};
var r={version:app.version,passed:false,stage:'opening'},doc,old=app.userInteractionLevel;
function write(){var f=new File(REPORT);f.encoding='UTF-8';f.open('w');f.write(encode(r));f.close();}
function need(ok,message){if(!ok)throw Error(message);}
function named(d,name){for(var i=0;i<d.pageItems.length;i++)if(d.pageItems[i].name===name)return d.pageItems[i];throw Error('Missing item '+name);}
function close(a,b){return Math.abs(a-b)<.05;}
function dashValues(p){var a=[],v=p.strokeDashes;for(var k in v)if(!isNaN(Number(k)))a.push(v[k]);return a;}
function check(d){
 var states=[['locked-path',true,false],['after-locked',false,false],['hidden-path',false,true],['after-hidden',false,false],['locked-group',true,false],['in-locked-group',false,false],['after-locked-group',false,false],['hidden-group',false,true],['in-hidden-group',false,false],['after-hidden-group',false,false]],out={states:[],strokes:[],images:[],textFrames:d.textFrames.length};
 for(var i=0;i<states.length;i++){var e=states[i],p=named(d,e[0]);need(p.locked===e[1]&&p.hidden===e[2],'Object state leaked: '+e[0]+' locked='+p.locked+' hidden='+p.hidden);out.states.push({name:e[0],locked:p.locked,hidden:p.hidden});}
 var caps=[['Butt',StrokeCap.BUTTENDCAP],['Round',StrokeCap.ROUNDENDCAP],['Square',StrokeCap.PROJECTINGENDCAP]];
 for(var i=0;i<caps.length;i++){var p=named(d,'cap-'+caps[i][0]);need(p.strokeCap===caps[i][1]&&close(p.strokeWidth,10),'Cap mismatch');out.strokes.push({name:p.name,width:p.strokeWidth,cap:String(p.strokeCap)});}
 var joins=[['Miter',StrokeJoin.MITERENDJOIN],['Round',StrokeJoin.ROUNDENDJOIN],['Bevel',StrokeJoin.BEVELENDJOIN]];
 for(var i=0;i<joins.length;i++){var p=named(d,'join-'+joins[i][0]);need(p.strokeJoin===joins[i][1]&&close(p.strokeMiterLimit,8),'Join mismatch');out.strokes.push({name:p.name,join:String(p.strokeJoin),miter:p.strokeMiterLimit});}
 for(var i=0;i<2;i++){var p=named(d,i?'dashed-arrow':'dash-offset'),dash=dashValues(p);need(dash.length===2&&close(dash[0],12)&&close(dash[1],4)&&close(p.strokeDashOffset,3),'Dash mismatch: '+p.name+' '+encode(dash));need(p.strokeCap===StrokeCap.ROUNDENDCAP&&p.strokeJoin===StrokeJoin.BEVELENDJOIN,'Dash style mismatch');out.strokes.push({name:p.name,dash:dash,offset:p.strokeDashOffset});if(i){app.redraw();var b=p.visibleBounds,h=b[1]-b[3],w=p.strokeWidth;p.strokeWidth=w*2;app.redraw();var c=p.visibleBounds;need(close(c[1]-c[3],2*h),'Dynamic arrow scale mismatch');p.strokeWidth=w;}}
 for(var i=0;i<2;i++){var p=named(d,'aligned-'+(i?'Outside':'Inside')),b=p.visibleBounds,w=p.strokeWidth,dash=dashValues(p);need(p.closed&&p.pathPoints.length===4,'Aligned rectangle geometry mismatch');for(var j=0;j<4;j++){var q=p.pathPoints[j];for(var z=0;z<2;z++)need(close(q.anchor[z],q.leftDirection[z])&&close(q.anchor[z],q.rightDirection[z]),'Curved rectangle handle');}need(dash.length===2&&close(dash[0],8)&&close(dash[1],4)&&close(p.strokeDashOffset,2),'Aligned dash mismatch');need(p.strokeJoin===StrokeJoin.BEVELENDJOIN,'Aligned join mismatch');p.strokeWidth=w*2;app.redraw();var c=p.visibleBounds;p.strokeWidth=w;if(!i)for(var z=0;z<4;z++)need(close(b[z],c[z]),'Inside alignment lost');out.strokes.push({name:p.name,dash:dash,offset:p.strokeDashOffset});}
 need(d.rasterItems.length===3,'Expected three embedded pictures');for(var i=0;i<3;i++){var p=named(d,['image-png','image-jpg','image-webp'][i]);need(p.typename==='RasterItem'&&p.embedded,'Picture is not embedded');out.images.push({name:p.name,embedded:p.embedded,width:p.width,height:p.height});}
 need(d.textFrames.length===2,'Editable text count mismatch');var t=named(d,'english-text'),before=t.contents;t.contents='Edited';need(t.contents==='Edited','Text not editable');t.contents=before;out.textEdit=true;return out;
}
try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;write();doc=app.open(new File(INPUT));r.before=check(doc);r.stage='saving';write();var opts=new IllustratorSaveOptions();opts.pdfCompatible=true;opts.compressed=true;doc.saveAs(new File(SAVED),opts);doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;doc=app.open(new File(SAVED));r.after=check(doc);var png=new ExportOptionsPNG24();png.artBoardClipping=true;png.transparency=false;doc.exportFile(new File(PNG),ExportType.PNG24,png);r.stage='complete';r.passed=true;}catch(e){r.error=String(e);r.line=e.line;}finally{if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);app.userInteractionLevel=old;write();}
})();`;
fs.writeFileSync(path.join(work,'check-regression.jsx'),'\ufeff'+script);console.log(JSON.stringify({work,script:path.join(work,'check-regression.jsx'),report},null,2));

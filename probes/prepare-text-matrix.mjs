// Determine which native text setup records Illustrator requires; synthetic reference only.
import fs from 'node:fs';
import path from 'node:path';
import {readAiBytes} from 'ai-file';
import {attachNative,decodeImages} from '../independent-export.mjs';
import {nativeStream} from '../native/stream.mjs';
import {fixture} from './fixture.mjs';
import {textSchemaFromFile} from '../native/txt2.mjs';
const refBytes=fs.readFileSync(process.argv[2]),ref=readAiBytes(refBytes);
const work=fs.mkdtempSync(path.resolve('work/text-matrix-'));
const source=fixture();source.document.layers[0].kind.children[0].kind.children[0].kind.children[0].kind.runs[0].text='中文尺寸全新文字';
const cases=[];
for(const variant of ['fonts','undo','both']) {
  const schema=textSchemaFromFile(ref);schema.includeFontEncodings=variant!=='undo';
  if(variant==='fonts')delete schema.undoRoot;
  const stream=nativeStream(source,decodeImages(source),{},schema);
  const file=path.join(work,variant+'.ai');fs.writeFileSync(file,await attachNative(refBytes,stream.bytes));cases.push(file.replace(/\\/g,'/'));
}
const verifier=fs.readFileSync('probes/verify-illustrator.jsx','utf8');
const encoder=verifier.slice(verifier.indexOf('    function encode(v)'),verifier.indexOf('    var doc, old='));
const script=`var CASES=${JSON.stringify(cases)};var REPORT=${JSON.stringify(path.join(work,'matrix-report.json').replace(/\\/g,'/'))};
(function(){${encoder}
var report={version:app.version,cases:[],stage:'starting'},doc,old=app.userInteractionLevel;
function write(){var f=new File(REPORT);f.encoding='UTF-8';f.open('w');f.write(encode(report));f.close();}
try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
for(var i=0;i<CASES.length;i++){
report.stage='opening';report.current=CASES[i];write();
try{doc=app.open(new File(CASES[i]));var texts=[];for(var j=0;j<doc.textFrames.length;j++)texts.push({contents:doc.textFrames[j].contents,font:doc.textFrames[j].textRange.characterAttributes.textFont.name,position:doc.textFrames[j].position});
report.cases.push({file:CASES[i],opened:true,artboards:doc.artboards.length,layers:doc.layers.length,groups:doc.groupItems.length,paths:doc.pathItems.length,texts:texts});}
catch(e){report.cases.push({file:CASES[i],opened:false,error:String(e)});}
finally{if(doc){doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;}}write();}
report.stage='complete';write();
}finally{app.userInteractionLevel=old;}
})();`;
fs.writeFileSync(path.join(work,'check-matrix.jsx'),'\ufeff'+script);
console.log(JSON.stringify({work,script:path.join(work,'check-matrix.jsx')},null,2));

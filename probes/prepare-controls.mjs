// Developer isolation tests, not an export path: uses a local synthetic Illustrator reference.
import fs from 'node:fs';
import path from 'node:path';
import { readAiBytes } from 'ai-file';
import { attachNative } from '../independent-export.mjs';
import { nativeStream } from '../native/stream.mjs';
import { fixture } from './fixture.mjs';
const reference=process.argv[2];
if(!reference)throw Error('Pass the locally generated synthetic reference.ai path');
const bytes=fs.readFileSync(reference),ref=readAiBytes(bytes);
const work=fs.mkdtempSync(path.resolve('work/controls-'));
fs.writeFileSync(path.join(work,'container-control.ai'),await attachNative(bytes,ref.container.stream));
const source=fixture();
function remove(nodes){return nodes.filter(n=>['layer','group','path'].includes(n.kind.type)).map(n=>{if(n.kind.children)n.kind.children=remove(n.kind.children);return n;});}
source.document.layers=remove(source.document.layers);
const raw=nativeStream(source).bytes.toString('latin1').replace(/%AI11_BeginTextDocument[\s\S]*?%AI11_EndTextDocument\r/,'');
fs.writeFileSync(path.join(work,'paths-control.ai'),await attachNative(bytes,Buffer.from(raw,'latin1')));
const cases=['container-control.ai','paths-control.ai'].map(n=>path.join(work,n).replace(/\\/g,'/'));
const verifier=fs.readFileSync('probes/verify-illustrator.jsx','utf8');
const encoder=verifier.slice(verifier.indexOf('    function encode(v)'),verifier.indexOf('    var doc, old='));
const script=`var CASES=${JSON.stringify(cases)};var REPORT=${JSON.stringify(path.join(work,'controls-report.json').replace(/\\/g,'/'))};
(function(){
${encoder}
var report={version:app.version,cases:[],stage:'starting'},doc,old=app.userInteractionLevel;
function write(){var f=new File(REPORT);f.encoding='UTF-8';f.open('w');f.write(encode(report));f.close();}
try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
for(var i=0;i<CASES.length;i++){
report.stage='opening';report.current=CASES[i];write();doc=app.open(new File(CASES[i]));
var texts=[];for(var j=0;j<doc.textFrames.length;j++)texts.push(doc.textFrames[j].contents);
report.cases.push({file:CASES[i],opened:true,artboards:doc.artboards.length,layers:doc.layers.length,groups:doc.groupItems.length,paths:doc.pathItems.length,texts:texts});
doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;write();}
report.stage='complete';write();
}catch(e){report.error=String(e);report.line=e.line;write();}
finally{if(doc){try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore){}}app.userInteractionLevel=old;}
})();`;
fs.writeFileSync(path.join(work,'check-controls.jsx'),'\ufeff'+script);
console.log(JSON.stringify({work,script:path.join(work,'check-controls.jsx')},null,2));

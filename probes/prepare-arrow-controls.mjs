// Synthetic-only reference diagnostics. Retained symbol/style records are not shipped artwork.
import fs from 'node:fs';
import path from 'node:path';
import {readAiBytes} from 'ai-file';
import {attachNative} from '../independent-export.mjs';
const reference=process.argv[2];if(!reference)throw Error('Pass synthetic arrow reference.ai');
const bytes=fs.readFileSync(reference),file=readAiBytes(bytes);
const raw=Buffer.from(file.container.stream).toString('latin1'),start=raw.indexOf('%%EndSetup');
let count=0;
const body=raw.slice(start).replace(/0 Ae\r\nu\r\n0 Ae\r\nu\r\n(?:0 Ap\r\n)?2 As[\s\S]*?1 \((Anon[^\r\n]+)\) XW/g,block=>{
  const at=block.lastIndexOf('%_2 As');if(at<0)throw Error('Missing source path');count++;
  return '0 Ae\ru\rU\r0 0 Xd\r6 () XW\r'+block.slice(at);
});
if(count!==2)throw Error('Expected two synthetic arrow appearance caches, got '+count);
const work=fs.mkdtempSync(path.resolve('work/arrow-controls-'));
const output=process.argv[3]?path.resolve(process.argv[3]):path.join(work,'without-arrow-cache.ai');
if(!process.argv[3])fs.writeFileSync(output,await attachNative(bytes,Buffer.from(raw.slice(0,start)+body,'latin1')),{flag:'wx'});
const report=path.join(work,'arrow-report.json').replace(/\\/g,'/');
const input=output.replace(/\\/g,'/'),saved=path.join(work,'reopened.ai').replace(/\\/g,'/');
const verifier=fs.readFileSync('probes/verify-illustrator.jsx','utf8');
const encoder=verifier.slice(verifier.indexOf('    function encode(v)'),verifier.indexOf('    var doc, old='));
const jsx=`var INPUT=${JSON.stringify(input)},SAVED=${JSON.stringify(saved)},REPORT=${JSON.stringify(report)};
(function(){${encoder}
var doc,old=app.userInteractionLevel,r={version:app.version,passed:false,stage:'opening'};
function write(){var f=new File(REPORT);f.encoding='UTF-8';f.open('w');f.write(encode(r));f.close();}
function check(d){var result=[];for(var i=0;i<d.pathItems.length;i++){var p=d.pathItems[i];if(p.pathPoints.length!==2)continue;var a=p.pathPoints[0].anchor,b=p.pathPoints[1].anchor;if(Math.abs(a[1]-b[1])>.01)continue;app.redraw();var bounds=p.visibleBounds,h=bounds[1]-bounds[3],w=p.strokeWidth;p.strokeWidth=w*2;app.redraw();var grown=p.visibleBounds,g=grown[1]-grown[3];p.strokeWidth=w;p.pathPoints[1].anchor=[b[0]+10,b[1]];var moved=p.pathPoints[1].anchor[0]===b[0]+10;p.pathPoints[1].anchor=b;result.push({name:p.name,width:w,height:h,doubledHeight:g,moved:moved});if(h<=w*1.5||Math.abs(g-2*h)>.12||!moved)throw Error('Native dynamic arrow check failed');}if(result.length!==2)throw Error('Expected two native arrow paths');return result;}
try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;write();doc=app.open(new File(INPUT));r.before=check(doc);r.stage='saving';write();if(new File(SAVED).exists)throw Error('Refusing overwrite');var options=new IllustratorSaveOptions();options.pdfCompatible=true;options.compressed=true;doc.saveAs(new File(SAVED),options);doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;doc=app.open(new File(SAVED));r.after=check(doc);r.passed=true;r.stage='complete';}
catch(e){r.error=String(e);r.line=e.line;}finally{if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);app.userInteractionLevel=old;write();}
})();`;
fs.writeFileSync(path.join(work,'check-arrows.jsx'),'\ufeff'+jsx);
console.log(JSON.stringify({work,script:path.join(work,'check-arrows.jsx')},null,2));

import fs from 'node:fs';
import path from 'node:path';
const [reference,input]=process.argv.slice(2);if(!reference||!input)throw Error('Pass synthetic reference.ai and independent test.ai');
const work=fs.mkdtempSync(path.resolve('work/acceptance-'));
const settings={reference:path.resolve(reference),input:path.resolve(input),saved:path.join(work,'reopened.ai'),report:path.join(work,'acceptance-report.json'),png:path.join(work,'actual.png')};
const source=fs.readFileSync('probes/verify-illustrator.jsx','utf8');
const encoder=source.slice(source.indexOf('    function encode(v)'),source.indexOf('    var doc, old='));
const jsx=`var SETTINGS=${JSON.stringify(settings)};
(function(){${encoder}
var report={version:app.version,passed:false,stage:'starting'},doc,old=app.userInteractionLevel;
function write(){var f=new File(SETTINGS.report);f.encoding='UTF-8';f.open('w');f.write(encode(report));f.close();}
function inspect(d){var texts=[],groups=[],layers=[],images=[],i;for(i=0;i<d.textFrames.length;i++){var t=d.textFrames[i];texts.push({contents:t.contents,font:t.textRange.characterAttributes.textFont.name,size:t.textRange.characterAttributes.size,position:t.position,anchor:t.anchor});}for(i=0;i<d.groupItems.length;i++)groups.push(d.groupItems[i].name);for(i=0;i<d.layers.length;i++)layers.push(d.layers[i].name);for(i=0;i<d.rasterItems.length;i++)images.push(d.rasterItems[i].geometricBounds);return{boards:d.artboards.length,layers:layers,groups:groups,paths:d.pathItems.length,texts:texts,images:images};}
function close(){if(doc){doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;}}
try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;report.stage='reference';write();
doc=app.open(new File(SETTINGS.reference));report.reference=inspect(doc);close();
report.stage='opening independent';write();doc=app.open(new File(SETTINGS.input));report.before=inspect(doc);write();
if(report.before.boards!==2||report.before.layers.length!==2||report.before.groups.length!==2||report.before.texts.length!==2||report.before.images.length!==1||report.before.paths!==1)throw Error('Object count mismatch');
for(var i=0;i<report.before.texts.length;i++){var t=report.before.texts[i],expected=null;for(var j=0;j<report.reference.texts.length;j++){var r=report.reference.texts[j];if(t.font===r.font)expected=r;}if(!expected)throw Error('Font mismatch');if(Math.abs(t.position[0]-expected.position[0])>0.1||Math.abs(t.position[1]-expected.position[1])>0.1)throw Error('Text position mismatch');if(Math.abs(t.size-expected.size)>0.01)throw Error('Font size mismatch');}
report.positionPassed=true;report.stage='editing';write();var target=doc.textFrames[0],contents=target.contents;target.contents=contents+'\u9a8c\u8bc1';if(target.contents!==contents+'\u9a8c\u8bc1')throw Error('Text edit failed');target.contents=contents;report.textEditPassed=true;
if(new File(SETTINGS.saved).exists)throw Error('Save destination exists');var options=new IllustratorSaveOptions();options.pdfCompatible=true;options.compressed=true;doc.saveAs(new File(SETTINGS.saved),options);close();
report.stage='reopening';write();doc=app.open(new File(SETTINGS.saved));report.after=inspect(doc);if(report.after.texts.length!==2||report.after.groups.length!==2)throw Error('Reopen lost structure');
var png=new ExportOptionsPNG24();png.artBoardClipping=true;png.transparency=false;doc.artboards.setActiveArtboardIndex(0);doc.exportFile(new File(SETTINGS.png),ExportType.PNG24,png);
report.passed=true;report.stage='complete';write();
}catch(e){report.error=String(e);report.line=e.line;write();}finally{close();app.userInteractionLevel=old;}
})();`;
const file=path.join(work,'check-acceptance.jsx');fs.writeFileSync(file,'\ufeff'+jsx);
console.log(JSON.stringify({work,script:file},null,2));

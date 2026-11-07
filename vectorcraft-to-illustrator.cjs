// Convert VectorCraft v4 objects into Illustrator objects through ExtendScript.
// Requires Node.js, vectorcraft-cli and an installed Illustrator COM server.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cp = require('child_process');
const [inputArg, outputArg, cliArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw Error('Usage: node vectorcraft-to-illustrator.cjs input.vectorcraft output.ai [vectorcraft-cli.exe]');
const input = path.resolve(inputArg), output = path.resolve(outputArg);
if (fs.existsSync(output)) throw Error('Output already exists; choose a new file name: ' + output);
fs.mkdirSync(path.dirname(output), { recursive: true });
const work = fs.mkdtempSync(path.join(path.dirname(output), '.vc-ai-'));
let bytes = fs.readFileSync(input);
if (bytes[0] === 31 && bytes[1] === 139) bytes = zlib.gunzipSync(bytes);
let end = bytes.indexOf(Buffer.from('\n\0VCBLOBS\0'));
if (end < 0) end = bytes.length;
let native = JSON.parse(bytes.subarray(0, end).toString('utf8'));
let doc = native.document;
if (!doc || native.format !== 'vectorcraft') throw Error('Not a VectorCraft document');
const cli = cliArg || 'D:/Program Files/VectorCraft/vectorcraft-cli.exe';
let renderInput=input;
const markerIds=[];let markerHeads=0;
function findMarkers(ns){for(const n of ns){if(n.kind.type==='path')for(const a of n.appearance?.items||[]){if(a.kind==='stroke'&&(a.start_arrow||a.end_arrow)){markerIds.push(n.id);markerHeads+=(a.start_arrow?1:0)+(a.end_arrow?1:0);break;}}if(n.kind.children)findMarkers(n.kind.children);}}
findMarkers(doc.layers);
if(markerIds.length)console.log('Preserving '+markerHeads+' LIVE arrowheads/dots on '+markerIds.length+' stroked paths...');
const images = [], counts = {};
function visit(nodes) {
  for (const n of nodes) {
    const k = n.kind;
    counts[k.type] = (counts[k.type] || 0) + 1;
    if (!['layer', 'group', 'text', 'path', 'image'].includes(k.type)) throw Error('Unsupported object: ' + k.type + ' #' + n.id);
    if (n.mask && k.type !== 'image') throw Error('Unsupported vector opacity mask #' + n.id);
    if (k.type === 'image') {
      const [a,b,c,d,e,f] = k.xf;
      if (a <= 0 || d <= 0 || b !== 0 || c !== 0) throw Error('Unsupported rotated/reflected image #' + n.id);
      k.exportRect = [e, f, a*k.width, d*k.height];
      k.exportFile = path.join(work, 'image-' + n.id + '.png').replace(/\\/g, '/');
      images.push(n);
    }
    if (k.children) visit(k.children);
  }
}
visit(doc.layers);
const steps = [];
for (const n of images) {
  const k = n.kind;
  steps.push({command:'select.set',params:{ids:[n.id]}});
  steps.push({command:'document.export',params:{path:k.exportFile,format:'png',selectedOnly:true,rect:k.exportRect,scale:Math.min(8,1/k.xf[0]),background:'transparent',includeArtboardFill:false}});
}
const commandFile = path.join(work, 'images.json');
fs.writeFileSync(commandFile, JSON.stringify(steps));
console.log('Rendering ' + images.length + ' source bitmap objects, including their alpha masks...');
const render = cp.spawnSync(cli, ['run','--in',renderInput,'--commands',commandFile], {encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
fs.writeFileSync(path.join(work,'render.log'), render.stdout + '\n' + render.stderr);
if (render.error || render.status !== 0) throw Error('VectorCraft image export failed: ' + (render.error || render.stderr));
for (const n of images) if (!fs.existsSync(n.kind.exportFile)) throw Error('Missing rendered image #' + n.id);
const payload = {document:{title:doc.title,color_mode:doc.color_mode,artboards:doc.artboards,layers:doc.layers},output:output.replace(/\\/g,'/'),report:(output+'.report.json').replace(/\\/g,'/'),preview:(output+'.preview.png').replace(/\\/g,'/'),expected:counts,markers:{paths:markerIds.length,heads:markerHeads,dynamic:true},actionFolder:work.replace(/\\/g,'/')};
const jsx = 'var VC_DATA=' + JSON.stringify(payload).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')) + ';\n' + fs.readFileSync(path.join(__dirname,'illustrator-rebuild.jsx'),'utf8');
const jsxFile = path.join(work,'convert.jsx');
fs.writeFileSync(jsxFile, '\ufeff' + jsx, 'utf8');
console.log('Rebuilding document in Illustrator...');
const ps = `param([string]$ScriptPath)\n$ErrorActionPreference='Stop'\n$keys=@('Illustrator.Application','Illustrator.Application.30','Illustrator.Application.29','Illustrator.Application.28','Illustrator.Application.27','Illustrator.Application.26','Illustrator.Application.25')\n$ai=$null\nforeach($key in $keys){try{$ai=New-Object -ComObject $key;break}catch{}}\nif($null -eq $ai){throw 'No registered Illustrator COM server. Install/register Illustrator, or run convert.jsx through File > Scripts > Other Script.'}\n$result=$ai.DoJavaScriptFile($ScriptPath)\nWrite-Output $result\n`;
const psFile = path.join(work,'run.ps1'); fs.writeFileSync(psFile,'\ufeff'+ps);
const run = cp.spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',psFile,'-ScriptPath',jsxFile],{encoding:'utf8',maxBuffer:4*1024*1024,windowsHide:true});
if (run.stdout) console.log(run.stdout.trim());
if (run.error || run.status !== 0 || !fs.existsSync(output)) throw Error('Illustrator conversion failed. ' + String(run.error || run.stderr).slice(0,1000) + '\nGenerated JSX retained at: ' + jsxFile);
const report=JSON.parse(fs.readFileSync(output+'.report.json','utf8').replace(/^\ufeff/,''));
if (!report.verified) throw Error('File saved but verification failed; inspect ' + output + '.report.json');
console.log('SUCCESS: '+output+'\nEditable text objects: '+report.textFrames+'; artboards: '+report.artboards+'\nWarnings: '+report.warnings.length+'\nWorking assets: '+work);

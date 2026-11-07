// Developer reference only: prepares the existing Illustrator rebuild script for synthetic art.
// This helper does not run Illustrator and is not an independent export implementation.
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './fixture.mjs';
const root=path.resolve('work');fs.mkdirSync(root,{recursive:true});
const work=fs.mkdtempSync(path.join(root,'illustrator-reference-'));
const source=fixture(),counts={};
const arrows=process.argv.includes('--arrows');
if(arrows){
  const children=source.document.layers[0].kind.children[0].kind.children[0].kind.children;
  const triangle=children.find(n=>n.kind.type==='path');
  triangle.name='Triangle native arrow';
  triangle.kind.path.subpaths[0].anchors=[{p:[40,150]},{p:[160,150]}];
  Object.assign(triangle.appearance.items[0],{end_arrow:'Triangle',arrow_scale:[100,100],arrow_align:'Tip'});
  const circles=structuredClone(triangle);circles.id=9;circles.name='Circle native arrows';
  circles.kind.path.subpaths[0].anchors=[{p:[40,190]},{p:[160,190]}];
  Object.assign(circles.appearance.items[0],{start_arrow:'Circle',end_arrow:'Circle'});children.push(circles);
}
function visit(nodes) {
  for(const n of nodes){
    const k=n.kind;counts[k.type]=(counts[k.type]||0)+1;
    if(k.type==='image') {
      k.exportFile=path.join(work,`image-${n.id}.png`).replace(/\\/g,'/');
      k.exportRect=[k.xf[4],k.xf[5],k.xf[0]*k.width,k.xf[3]*k.height];
      fs.writeFileSync(k.exportFile,Buffer.from(source.images[k.key].data,'base64'));
    }
    if(k.children)visit(k.children);
  }
}
visit(source.document.layers);
const out=path.join(work,'reference.ai');
const data={document:source.document,output:out.replace(/\\/g,'/'),report:(out+'.report.json').replace(/\\/g,'/'),preview:(out+'.preview.png').replace(/\\/g,'/'),expected:counts,markers:{paths:arrows?2:0,heads:arrows?3:0,dynamic:true},actionFolder:work.replace(/\\/g,'/')};
fs.writeFileSync(path.join(work,'source.vectorcraft'),JSON.stringify(source));
const jsx='var VC_DATA='+JSON.stringify(data).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+';\n'+fs.readFileSync('illustrator-rebuild.jsx','utf8');
const file=path.join(work,'create-reference.jsx');fs.writeFileSync(file,'\ufeff'+jsx);
console.log(JSON.stringify({script:file,output:out},null,2));

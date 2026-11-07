// Local synthetic-only ablation. No retained data is used by the independent exporter.
import fs from 'node:fs';
import path from 'node:path';
import {readAiBytes} from 'ai-file';
import {textSchemaFromFile,writeTypedTxt2} from '../native/txt2.mjs';
import {ascii85Lines} from '../native/stream.mjs';
import {attachNative} from '../independent-export.mjs';
const [reference,generated,harness,selection]=process.argv.slice(2);
if(!reference||!generated||!harness)throw Error('Pass synthetic reference.ai generated.ai and check-matrix.jsx');
const bytes=fs.readFileSync(reference),file=readAiBytes(bytes),fresh=textSchemaFromFile(readAiBytes(fs.readFileSync(generated)));
const raw=Buffer.from(file.container.stream).toString('latin1'),begin='%AI11_BeginTextDocument',end='%AI11_EndTextDocument';
const i=raw.indexOf(begin),j=raw.indexOf(end,i);if(i<0||j<i)throw Error('Missing text section');
const work=fs.mkdtempSync(path.resolve('work/block-controls-')),cases=[];
const encode=root=>ascii85Lines(Buffer.from(writeTypedTxt2(root),'latin1'));
const variants=['combined-reduction','fresh-frame-shape','fresh-normal-styles','fresh-story-model','minimal-engine-settings','paragraph-only','character-features-no-paint','character-paints'];
for(const variant of selection?selection.split(','):variants){
  if(!variants.includes(variant))throw Error('Unknown variant: '+variant);
  const schema=textSchemaFromFile(file);
  for(const [root,newRoot]of [[schema.root,fresh.root],[schema.undoRoot,fresh.undoRoot]]){
    if(variant==='combined-reduction'){
      root.get('1').delete('4');root.get('1').delete('5');
      for(const key of ['2','3','4','9'])root.get('0').delete(key);
      for(const story of root.get('1').get('1')||[])story.get('1').delete('2');
    }else if(variant==='fresh-frame-shape'){
      const frames=root.get('0').get('8')?.get('0')||[];
      for(const frame of frames){const f=frame.get('0');frame.set('0',new Map([['0',f.get('0')],['2',new Map([['2',f.get('2').get('2')]])]]));}
    }else if(variant==='fresh-normal-styles'){
      const normalFont=root.get('1').get('2').get('0');
      for(const key of ['5','6'])root.get('0').set(key,structuredClone(newRoot.get('0').get(key)));
      for(const key of ['2','3'])root.get('1').set(key,structuredClone(newRoot.get('1').get(key)));
      root.get('1').get('2').set('0',normalFont);
      root.get('0').get('5').get('0')[0].get('0').get('6').set('0',normalFont);
    }else if(variant==='minimal-engine-settings'){
      root.get('1').set('0',structuredClone(newRoot.get('1').get('0')));
    }else{
      const names=root.get('0').get('1').get('0').map(f=>f.get('0').get('0').get('0'));
      const newNames=newRoot.get('0').get('1').get('0').map(f=>f.get('0').get('0').get('0'));
      const stories=root.get('1').get('1')||[],newStories=newRoot.get('1').get('1')||[];
      for(let n=0;n<stories.length;n++){
        const model=structuredClone(newStories[n].get('0'));
        for(const run of model.get('6').get('0')){const f=run.get('0').get('0').get('6');const index=names.indexOf(newNames[f.get('0')]);if(index<0)throw Error('Missing font');f.set('0',index);}
        const target=stories[n].get('0');
        if(variant==='paragraph-only')target.set('5',model.get('5'));
        else if(variant==='character-features-no-paint'){
          for(const run of model.get('6').get('0')){const f=run.get('0').get('0').get('6');f.delete('53');f.delete('54');}
          target.set('6',model.get('6'));
        }else if(variant==='character-paints'){
          const f=target.get('6').get('0')[0].get('0').get('0').get('6');
          const desired=model.get('6').get('0')[0].get('0').get('0').get('6');
          for(const key of ['53','54','56','57'])if(desired.has(key))f.set(key,desired.get(key));
        }else stories[n].set('0',model);
      }
    }
  }
  const section=`${begin}\r/AI11TextDocument : /ASCII85Decode ,\r${encode(schema.root)}\r${schema.rulerOrigin.join(' ')} /RulerOrigin ,\r;\r/AI11UndoFreeTextDocument : /ASCII85Decode ,\r${encode(schema.undoRoot)}\r;\r${end}`;
  const output=path.join(work,variant+'.ai');fs.writeFileSync(output,await attachNative(bytes,Buffer.from(raw.slice(0,i)+section+raw.slice(j+end.length),'latin1')),{flag:'wx'});cases.push(output.replace(/\\/g,'/'));
}
const report=path.join(work,'block-report.json').replace(/\\/g,'/');
const source=fs.readFileSync(harness,'utf8').replace(/^\ufeff/,'');
fs.writeFileSync(path.join(work,'check-blocks.jsx'),'\ufeff'+source.replace(/^var CASES=.*?;var REPORT=.*?;/,()=>`var CASES=${JSON.stringify(cases)};var REPORT=${JSON.stringify(report)};`));
console.log(JSON.stringify({work,script:path.join(work,'check-blocks.jsx')},null,2));

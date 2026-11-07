// SPDX-License-Identifier: GPL-2.0-or-later
// Adapted from vurglepuddle/PROOF ai-native-writer-text.cpp, commit d822dc5dea265675a0fd5dec550e3e0dcd5988f0.
// This point-text subset follows its minimal fresh document construction, not retained Adobe files.
// Attribution and source links: THIRD_PARTY.md. License: LICENSES/GPL-2.0.txt.
import defaults from './proof-defaults.json' with {type:'json'};
import {parseTypedTxt2,real} from './txt2.mjs';
// JavaScript sorts numeric object keys; native tagged dictionaries require their /99 tag first.
const M=o=>new Map(Object.entries(o).sort(([a],[b])=>(a==='99'?-1:0)-(b==='99'?-1:0)));
const copy=v=>structuredClone(v);
function normal(raw){return parseTypedTxt2(Buffer.from('/0 << '+raw+' >>','latin1')).get('0');}
export function freshTextDocuments(fonts,frames,stories,rulerOrigin=[0,0]){
  const names=['MyriadPro-Regular','AdobeInvisFont',...fonts];
  const character=normal(defaults.character),paragraph=normal(defaults.paragraph);
  const resources=M({
    1:M({0:names.map((name,i)=>M({0:M({99:{name:'CoolTypeFont'},0:M({0:name,2:i<2?0:1})})})),1:names.map((_,i)=>M({0:i}))}),
    5:M({0:[M({0:M({0:'[Normal Character Style]',6:copy(character)})})],1:[M({0:0})]}),
    6:M({0:[M({0:M({0:'[Normal Paragraph Style]',5:copy(paragraph)})})],1:[M({0:0})]}),
    8:M({0:copy(frames).map(frame=>{
      const matrix=frame.get('0').get('2').get('2');
      // The canvas offset is applied after the object's affine, never rotated or scaled by it.
      for(let axis=0;axis<2;axis++)matrix[4+axis]=real(Number(matrix[4+axis].raw.replace('~VC_REAL~',''))+rulerOrigin[axis]);
      return frame;
    })})
  });
  const complete=stories.map((story,i)=>{
    const model=copy(story.get('0')),text=model.get('0');
    for(const run of model.get('6').get('0')){
      const f=run.get('0').get('0').get('6');
      f.set('0',f.get('0')+2);
      run.get('0').set('0',new Map([['0',''],['5',0],['6',f]]));
    }
    for(const run of model.get('5').get('0')){
      const style=run.get('0').get('0');
      const p=style.get('5');p.set('33',0);p.set('35',0);
      run.get('0').set('0',new Map([['0',''],['5',p],['6',0]]));
    }
    model.set('10',M({0:4,2:true}));
    // Illustrator 30 recomposes the model; a synthetic layout is unnecessary native input.
    return M({0:model,1:M({0:[M({0:i})]})});
  });
  const config=M({1:0,2:0,3:real(.583),4:real(.333),5:real(.583),6:real(.333),7:real(.7),8:true,11:6,16:true,17:0});
  function document(typed){const r=copy(resources);if(!typed)r.delete('8');const e=M({0:copy(config)});if(typed)e.set('1',copy(complete));e.set('2',copy(character));e.set('3',copy(paragraph));return new Map([['98',M({0:14})],['0',r],['1',e]]);}
  return {root:document(true),undoRoot:document(false),rulerOrigin};
}

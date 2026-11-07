// Reuse the verified JavaScript arrow definitions in the Rust/Wasm writer.
import fs from 'node:fs';
import {arrowStyle,arrowSymbols} from '../native/arrows.mjs';
import {alignedStrokeStyle} from '../native/stroke-offset.mjs';
fs.mkdirSync('plugin/src/templates',{recursive:true});
for(const mode of ['begin','end','both']){
  const stroke={start_arrow:mode==='end'?null:'Triangle',end_arrow:mode==='begin'?null:'Circle',arrow_align:'Tip',arrow_scale:[101,102],width:103,paint:{color:{}}};
  const record=arrowStyle('__ID__',stroke,{number:n=>({101:'__BEGIN_SCALE__',102:'__END_SCALE__',103:'__WIDTH__'}[n]||String(n)),quote:s=>'('+s+')',color:()=>'__COLOR__'});
  fs.writeFileSync(`plugin/src/templates/arrow-${mode}.pgf`,record.style.replace('0 J 0 j __WIDTH__ w 4 M []0 d','__STROKE_ATTRIBUTES__').replaceAll('VC Arrow Triangle','VC Arrow __BEGIN_KIND__').replaceAll('VC Arrow Circle','VC Arrow __END_KIND__'));
}
fs.writeFileSync('plugin/src/templates/symbols.pgf',arrowSymbols(['Triangle','Circle','Square','Diamond','Bar','TriangleOpen','CircleOpen','SquareOpen','DiamondOpen']));
const aligned=alignedStrokeStyle('__ID__',{align:'Inside',width:103,paint:{color:{}}},{paint:{color:{}}},{number:String,quote:s=>'('+s+')',color:(_,stroke)=>stroke?'__STROKE_COLOR__':'__FILL_COLOR__'});
fs.writeFileSync('plugin/src/templates/stroke-offset.pgf',aligned.style.replace('0 J 0 j 103 w 4 M []0 d','__STROKE_ATTRIBUTES__').replace('(Inside) /String','(__DISPLAY__) /String').replace('1 /Bool (StrokeOffsetInside)','__INSIDE__ /Bool (StrokeOffsetInside)'));

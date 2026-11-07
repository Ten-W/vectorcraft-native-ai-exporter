import {strokeAttributes} from './stroke-attributes.mjs';
// Native live stroke alignment. Construct records, never alter the editable path geometry.
export function alignedStrokeStyle(id,stroke,fill,{number,quote,color}){
  if(!['Inside','Outside'].includes(stroke.align))throw Error('Expected Inside or Outside stroke alignment');
  const neutral='0 1 0 0 0 Xy\r0 J 0 j 1 w 4 M []0 d 0 XR';
  const basic=(name,body,extra='',version='0 0')=>`/BasicFilter :\r(${name}) ${version} /Filter ,\r1 /Visible ,\r${extra}/Dictionary : /NotRecorded ,\r${body}\r; /Dict ; /Part ,\r`;
  const chain=body=>`/CompoundFilter :\r(Chain Style Filter) 0 0 /Filter ,\r1 /Visible ,\r${body}; /Part ,\r`;
  const blend=basic('Blend Style Filter',`/BlendStyle : ${neutral}\r/Def ; (BlendStyle) ,`);
  const inside=stroke.align==='Inside';
  const offset=basic('Adobe Stroke Offset',`(${inside?'Inside':'Outside'}) /String (DisplayString) ,\r/StrokeStyle : 0 R\r${color(stroke.paint.color,true)}\r${neutral}\r${strokeAttributes(stroke,number)}\r1 0 Xd\r/Def ; (StrokeStyle) ,\r${inside?1:0} /Bool (StrokeOffsetInside) ,`,'(Illustrator.exe) /PluginFileName ,\r(Stroke Offset Live Effect) /Title ,\r2 /FillOrStroke ,\r','1 0');
  const fillStyle=basic('Fill Style Filter',`0 /Bool (UseEvenOdd) ,\r/FillStyle : 0 O\r${neutral}\r${fill?color(fill.paint.color,false)+'\r0 1':'0 0'} Xd\r/Def ; (FillStyle) ,`);
  const conduit='/BasicFilter :\r(Conduit Filter) 0 0 /Filter ,\r1 /Visible ,\r; /Part ,\r';
  const stack=`/CompoundFilter :\r(Stack Style Filter) 0 0 /Filter ,\r1 /Visible ,\r${chain(offset+blend)}${conduit}${chain(fillStyle+blend)}; /Part ,\r`;
  const name='VC Stroke Alignment '+id;
  const root=chain(stack+blend).slice(0,-'; /Part ,\r'.length);
  return {name,style:`/KnownStyle :\r${quote(name)} /Name ,\r/ActiveStyle :\r${root}; /Execution ; /Def ;\r`};
}

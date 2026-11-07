import {strokeAttributes} from './stroke-attributes.mjs';
// Fresh native stroke attributes and elementary symbols; no Adobe presets or runtime calls.
export function arrowStyle(id,stroke,{number,quote,color}){
  const kinds=[stroke.start_arrow,stroke.end_arrow].filter(Boolean);
  if(kinds.some(k=>!['Triangle','Circle','Square','Diamond','Bar','TriangleOpen','CircleOpen','SquareOpen','DiamondOpen'].includes(k)))throw Error('Unsupported native arrow shape');
  if(stroke.arrow_align&&stroke.arrow_align!=='Tip')throw Error('Only tip-aligned native arrows are verified');
  const scales=stroke.arrow_scale||[100,100];
  if(!Array.isArray(scales)||scales.length!==2||scales.some(s=>!Number.isFinite(s)||s<=0||s>1000))throw Error('Invalid native arrow scales');
  const name='VC Arrow Style '+id;
  const attributes=['1 /Int (BSAdvStrokeDictionaryVersion) ,'];
  for(const [i,end]of ['Begin','End'].entries())if([stroke.start_arrow,stroke.end_arrow][i]){
    attributes.push(`${number(scales[i])} /Real (BSArrow${end}Scale) ,`,
      `/GObjRef : ${quote('VC Arrow '+[stroke.start_arrow,stroke.end_arrow][i])} /SymbolArt ; (BSArrow${end}Symbol) ,`);
  }
  const neutral='0 1 0 0 0 Xy\r0 J 0 j 1 w 4 M []0 d 0 XR';
  const style=`/KnownStyle :\r${quote(name)} /Name ,\r/ActiveStyle :
/CompoundFilter :\r(Chain Style Filter) 0 0 /Filter ,\r1 /Visible ,
/CompoundFilter :\r(Stack Style Filter) 0 0 /Filter ,\r1 /Visible ,
/BasicFilter :\r(Stroke Style Filter) 0 0 /Filter ,\r1 /Visible ,\r2 /FillOrStroke ,
/Dictionary : /NotRecorded ,\r/StrokeStyle : 0 R\r${color(stroke.paint.color,true)}
${neutral}\r${strokeAttributes(stroke,number)}\r1 0 Xd\r/Def ; (StrokeStyle) ,
/Dictionary : /NotRecorded ,\r${attributes.join('\r')}\r; (kAIBeautifulStrokesParamsDictKey) ,
; /Dict ; /Part ,\r/BasicFilter :\r(Conduit Filter) 0 0 /Filter ,\r1 /Visible ,\r; /Part ,
/BasicFilter :\r(Fill Style Filter) 0 0 /Filter ,\r1 /Visible ,\r/Dictionary : /NotRecorded ,
/FillStyle : ${neutral}\r0 0 Xd\r/Def ; (FillStyle) ,\r0 /Bool (UseEvenOdd) ,\r; /Dict ; /Part ,
; /Part ,\r/BasicFilter :\r(Blend Style Filter) 0 0 /Filter ,\r1 /Visible ,\r/Dictionary : /NotRecorded ,
/BlendStyle : ${neutral}\r/Def ; (BlendStyle) ,\r; /Dict ; /Part ,\r; /Execution ; /Def ;\r`.replace(/\n/g,'\r');
  return {name,style,kinds};
}

export function arrowSymbols(kinds){
  let out='%AI5_Begin_NonPrinting\rNp\r';
  for(const kind of new Set(kinds)){
    // Native scale 100 means four times the source line width. A symbol's own
    // stroke stays one point in Illustrator, so hollow heads use filled rings.
    const polygon=points=>points.map(([x,y],i)=>x+' '+y+' '+(i?'L':'m')).join('\r')+'\r'+points[0].join(' ')+' L\rf';
    const circle=r=>{const k=r*.55228475;return [
      (8+r)+' 0 m', [8+r,k,8+k,r,8,r,'C'].join(' '),[8-k,r,8-r,k,8-r,0,'C'].join(' '),[8-r,-k,8-k,-r,8,-r,'C'].join(' '),[8+k,-r,8+r,-k,8+r,0,'C'].join(' '),'f'].join('\r');};
    const rings={
      TriangleOpen:[polygon([[6,2],[10,0],[6,-2]]),polygon([[6.25,1.5954915],[9.440983,0],[6.25,-1.5954915]])],
      SquareOpen:[polygon([[6,2],[10,2],[10,-2],[6,-2]]),polygon([[6.25,1.75],[9.75,1.75],[9.75,-1.75],[6.25,-1.75]])],
      DiamondOpen:[polygon([[6,0],[8,2],[10,0],[8,-2]]),polygon([[6.3535534,0],[8,1.6464466],[9.6464466,0],[8,-1.6464466]])],
      CircleOpen:[circle(2),circle(1.75)]
    };
    const shape=rings[kind]?'1 XR\r*u\r'+rings[kind].join('\r')+'\r*U\r0 XR':kind==='Bar'?polygon([[9.25,2],[10,2],[10,-2],[9.25,-2]]):kind==='Square'||kind==='SquareOpen'?'6 2 m\r10 2 L\r10 -2 L\r6 -2 L\r6 2 L\r'+(kind==='Square'?'f':'s'):kind==='Diamond'||kind==='DiamondOpen'?'6 0 m\r8 2 L\r10 0 L\r8 -2 L\r6 0 L\r'+(kind==='Diamond'?'f':'s'):kind==='Triangle'||kind==='TriangleOpen'?'6 2 m\r10 0 L\r6 -2 L\r6 2 L\r'+(kind==='Triangle'?'f':'s'):
      '10 0 m\r10 1.10457 9.10457 2 8 2 C\r6.89543 2 6 1.10457 6 0 C\r6 -1.10457 6.89543 -2 8 -2 C\r9.10457 -2 10 -1.10457 10 0 C\r'+(kind==='CircleOpen'?'s':'f');
    out+=`%AI14_BeginSymbol\r(VC Arrow ${kind})\r0 A\r0 Xw\r0 Ae\ru
1 Ap\r4 As\r0 1 0 0 0 Xy\r0 J 0 j 1 w 4 M []0 d 0 XR
11 4 m\r-11 4 L\r-11 -4 L\r11 -4 L\r11 4 L\rn
0 Ap\r2 As\r0 R\r0 G\r-10 0 m\r${kind==='Bar'?9.625:6} 0 L\rS\r0 O\r0 g\r${shape}\rU
%_/ArtDictionary :\r%_5 /Int (AI13PatternRegistrationType) ,
%_2 /Int (AI13PatternExportType) ,\r%_0 /Bool (AI13PatternEnableGuides) ,\r%_;\r%_
9 () XW\r%AI10_EndSymbol\r`.replace(/\n/g,'\r');
  }
  return out+'%AI5_End_NonPrinting--\r';
}

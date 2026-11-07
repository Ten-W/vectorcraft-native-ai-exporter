// Shared by the plain-path writer and both native appearance generators.
export function strokeAttributes(stroke,number=String){
  const cap={Butt:0,Round:1,Square:2}[stroke.cap||'Butt'];
  const join={Miter:0,Round:1,Bevel:2}[stroke.join||'Miter'];
  if(cap===undefined||join===undefined)throw Error('不支持此描边端点或转角类型');
  const width=stroke.width??1,miter=stroke.miter_limit??4;
  const dash=stroke.dash;
  if(dash?.align_corners)throw Error('暂不支持自动贴合转角的虚线，请关闭该选项后导出');
  const pattern=Array.isArray(dash)?dash:dash?.pattern||[];
  const offset=Array.isArray(dash)?0:dash?.offset??0;
  if(pattern.length>6||pattern.some(x=>!Number.isFinite(x)||x<0)||pattern.length&&!pattern.some(x=>x>0)||!Number.isFinite(offset)||!Number.isFinite(width)||width<0||!Number.isFinite(miter)||miter<1)throw Error('描边线宽、尖角限制或虚线参数无效');
  return `${cap} J ${join} j ${number(width)} w ${number(miter)} M [${pattern.map(number).join(' ')}]${number(offset)} d`;
}

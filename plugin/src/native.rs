// SPDX-License-Identifier: GPL-2.0-or-later
// Rust/Wasm implementation of the experimentally verified native/stream.mjs subset.
// Text resource construction derives from PROOF; see THIRD_PARTY.md and LICENSES/GPL-2.0.txt.
use serde_json::Value as V;
use kurbo::{CubicBez,ParamCurveArclen,ParamCurveExtrema};
use base64::{engine::general_purpose::STANDARD,Engine};
type R<T>=Result<T,String>;
fn s(v:&V)->&str{v.as_str().unwrap_or("")}
fn arr(v:&V)->R<&Vec<V>>{v.as_array().ok_or_else(||"文档数据格式不正确：应为数组".into())}
fn f(v:&V,default:f64)->R<f64>{if v.is_null(){return Ok(default)}let x=v.as_f64().ok_or("文档中存在无效数值")?;if !x.is_finite()||x.abs()>16000000.0{return Err("文档中存在无效或超出范围的数值".into())}Ok(x)}
fn number(x:f64,digits:usize)->String{let v=format!("{x:.digits$}");let t=v.trim_end_matches('0').trim_end_matches('.');if t=="-0"{"0".into()}else{t.into()}}
fn n(x:f64)->String{number(x,6)}
fn real(x:f64)->String{let t=number(x,5);if t.contains('.'){t}else{t+".0"}}
fn ps(text:&str)->String{let mut out="(".to_string();for b in text.bytes(){match b{b'('|b')'|b'\\'=>{out.push('\\');out.push(b as char)},32..=126=>out.push(b as char),_=>out.push_str(&format!("\\{b:03o}"))}}out.push(')');out}
fn utf(text:&str)->String{let mut out="(".to_string();for b in [254u8,255].into_iter().chain(text.encode_utf16().flat_map(u16::to_be_bytes)){if b==b'('||b==b')'||b==b'\\'{out.push('\\')}out.push(b as char)}out.push(')');out}
fn latin(text:&str)->Vec<u8>{text.chars().map(|c|c as u32 as u8).collect()}
fn ascii85(data:&[u8])->String{let mut out=String::new();for chunk in data.chunks(4){let mut value=0u32;for i in 0..4{value=(value<<8)|*chunk.get(i).unwrap_or(&0) as u32}if value==0&&chunk.len()==4{out.push('z');continue}let mut digits=[0u8;5];for d in digits.iter_mut().rev(){*d=(value%85)as u8+33;value/=85}for b in &digits[..chunk.len()+1]{out.push(*b as char)}}out.as_bytes().chunks(100).map(|line|format!("% {}",String::from_utf8_lossy(line))).collect::<Vec<_>>().join("\r")+"~>\r"}
fn gray(c:&V)->R<f64>{let value=if c["k"].is_null(){f(&c["gray"],0.0)?}else{1.0-f(&c["k"],0.0)?};if !(0.0..=1.0).contains(&value){return Err("灰度颜色超出范围".into())}Ok(value)}
fn color(c:&V,stroke:bool)->R<String>{let model=s(&c["model"]);if model=="gray"{return Ok(format!("{} {}",n(gray(c)?),if stroke{"G"}else{"g"}))}let keys:&[&str]=match model{"rgb"=>&["r","g","b"],"cmyk"=>&["c","m","y","k"],"gray"=>&["gray"],_=>return Err("暂不支持此颜色模式".into())};let values=keys.iter().map(|k|f(&c[*k],0.0).map(n)).collect::<R<Vec<_>>>()?.join(" ");Ok(match model{"rgb"=>format!("0 0 0 0 {values} {}",if stroke{"XA"}else{"Xa"}),"cmyk"=>format!("{values} {}",if stroke{"K"}else{"k"}),_=>format!("{values} {}",if stroke{"G"}else{"g"})})}
fn paint(p:&V)->R<Option<String>>{if p.is_null()||s(&p["type"])=="none"{return Ok(None)}if s(&p["type"])!="solid"{return Err("暂不支持文字的渐变或图案填色，请使用实色".into())}let c=&p["color"];if s(&c["model"])=="gray"{return Ok(Some(format!("<< /99 /SimplePaint /0 << /0 0 /1 [ 1.0 {} ] >> >>",real(gray(c)?))))}let(model,keys):(u32,&[&str])=match s(&c["model"]){"rgb"=>(1,&["r","g","b"]),"cmyk"=>(2,&["c","m","y","k"]),"gray"=>(0,&["gray"]),_=>return Err("暂不支持此文字颜色模式".into())};let values=keys.iter().map(|k|f(&c[*k],0.0).map(real)).collect::<R<Vec<_>>>()?.join(" ");Ok(Some(format!("<< /99 /SimplePaint /0 << /0 {model} /1 [ 1.0 {values} ] >> >>")))}
fn point(v:&V)->R<[f64;2]>{if let Some(a)=v.as_array(){if a.len()!=2{return Err("坐标需要两个分量".into())}Ok([f(&a[0],0.0)?,f(&a[1],0.0)?])}else if v.is_object()&&!v["x"].is_null()&&!v["y"].is_null(){Ok([f(&v["x"],0.0)?,f(&v["y"],0.0)?])}else{Err("坐标数据不正确".into())}}
fn pair(v:&V)->R<String>{let a=point(v)?;Ok(format!("{} {}",n(a[0]),n(-a[1])))}


fn stroke_attributes(st:&V)->R<String>{
 if !st["profile"].is_null()||!st["brush"].is_null(){return Err("暂不支持宽度配置或画笔描边，请使用普通等宽描边后导出".into())}
 let cap=match s(&st["cap"]){""|"Butt"=>0,"Round"=>1,"Square"=>2,_=>return Err("不支持此描边端点类型".into())};
 let join=match s(&st["join"]){""|"Miter"=>0,"Round"=>1,"Bevel"=>2,_=>return Err("不支持此描边转角类型".into())};
 let width=f(&st["width"],1.0)?;let miter=f(&st["miter_limit"],4.0)?;if width<0.0||miter<1.0{return Err("描边线宽或尖角限制无效".into())}
 let dash=&st["dash"];if dash["align_corners"].as_bool()==Some(true){return Err("暂不支持自动贴合转角的虚线，请关闭该选项后导出".into())}
 let empty=Vec::new();let pattern=if dash.is_array(){arr(dash)?}else if dash["pattern"].is_null(){&empty}else{arr(&dash["pattern"])?};
 let values=pattern.iter().map(|v|f(v,0.0)).collect::<R<Vec<_>>>()?;
 if values.len()>6||values.iter().any(|x|*x<0.0)||!values.is_empty()&&!values.iter().any(|x|*x>0.0){return Err("虚线参数无效".into())}
 let offset=f(&dash["offset"],0.0)?;Ok(format!("{cap} J {join} j {} w {} M [{}]{} d",n(width),n(miter),values.iter().map(|x|n(*x)).collect::<Vec<_>>().join(" "),n(offset)))
}

fn transparency(node:&V)->R<String>{
 let mode=match s(if node["blend"].is_null(){&node["blend_mode"]}else{&node["blend"]}){""|"Normal"=>0,"Multiply"=>1,"Screen"=>2,"Overlay"=>3,"SoftLight"=>4,"HardLight"=>5,"ColorDodge"=>6,"ColorBurn"=>7,"Darken"=>8,"Lighten"=>9,"Difference"=>10,"Exclusion"=>11,"Hue"=>12,"Saturation"=>13,"Color"=>14,"Luminosity"=>15,_=>return Err("暂不支持此混合模式".into())};
 let opacity=f(&node["opacity"],1.0)?;if !(0.0..=1.0).contains(&opacity){return Err("透明度必须在0到1之间".into())}
 let knockout=match s(&node["knockout"]){""|"off"|"Off"=>0,"on"|"On"=>1,"neutral"|"Neutral"=>2,_=>return Err("无效的挖空组设置".into())};
 Ok(format!("{mode} {} {} {knockout} {} Xy",n(opacity),if node["isolate"].as_bool()==Some(true){1}else{0},if node["knockout_shape"].as_bool()==Some(true){1}else{0}))
}
fn sub_segments(sub:&V)->R<(Vec<[f64;8]>,bool)>{
 let a=arr(&sub["anchors"])?;if a.len()<2||a.len()>4096{return Err("框架路径需要2到4096个锚点".into())}let closed=sub["closed"].as_bool()==Some(true);
 let xy=|p:&V|->R<[f64;2]>{let v=arr(p)?;if v.len()!=2{return Err("无效的框架坐标".into())}Ok([f(&v[0],0.0)?,f(&v[1],0.0)?])};let mut segments=Vec::new();
 for i in 0..(a.len()-1+if closed{1}else{0}){let prev=&a[i%a.len()];let next=&a[(i+1)%a.len()];let p=xy(&prev["p"])?;let q=xy(&next["p"])?;let c=xy(if prev["out"].is_null(){&prev["p"]}else{&prev["out"]})?;let d=xy(if next["in"].is_null(){&next["p"]}else{&next["in"]})?;segments.push([p[0],p[1],c[0],c[1],d[0],d[1],q[0],q[1]]);}
 Ok((segments,closed))
}

fn frame_segments(path:&V)->R<(Vec<[f64;8]>,bool)>{let subs=arr(&path["subpaths"])?;if subs.len()!=1{return Err("文字框架目前只支持单条路径".into())}sub_segments(&subs[0])}
fn cubic(a:&[f64;8])->CubicBez{CubicBez::new((a[0],a[1]),(a[2],a[3]),(a[4],a[5]),(a[6],a[7]))}
fn path_bounds(path:&V)->R<[f64;4]>{let mut b=[f64::INFINITY,f64::INFINITY,f64::NEG_INFINITY,f64::NEG_INFINITY];for sub in arr(&path["subpaths"])?{for a in sub_segments(sub)?.0{let r=cubic(&a).bounding_box();b[0]=b[0].min(r.x0);b[1]=b[1].min(r.y0);b[2]=b[2].max(r.x1);b[3]=b[3].max(r.y1);}}if !b.iter().all(|x|x.is_finite()){return Err("路径没有有效边界".into())}Ok(b)}
fn bracket(segments:&[[f64;8]],fraction:f64)->R<f64>{let lengths:Vec<f64>=segments.iter().map(|a|cubic(a).arclen(1e-6)).collect();let total:f64=lengths.iter().sum();if total<=1e-8{return Err("路径文字的路径长度必须大于0".into())}let turns=fraction.floor();let mut left=(fraction-turns)*total;for(i,(a,len))in segments.iter().zip(lengths.iter()).enumerate(){if left<=*len||i==segments.len()-1{return Ok(turns*segments.len() as f64+i as f64+cubic(a).inv_arclen(left,1e-6))}left-=len;}Err("无法定位路径文字区间".into())}

fn arrow_values(stroke:&V)->R<(&str,&str,Vec<f64>)>{
  let begin=s(&stroke["start_arrow"]);let end=s(&stroke["end_arrow"]);if [begin,end].iter().any(|k|!k.is_empty()&&!["Triangle","Circle","Square","Diamond","Bar","TriangleOpen","CircleOpen","SquareOpen","DiamondOpen"].contains(k)){return Err("目前动态箭头支持三角形、圆点、方形、菱形及竖线，其他形状暂不支持".into())}if !s(&stroke["arrow_align"]).is_empty()&&s(&stroke["arrow_align"])!="Tip"{return Err("动态箭头目前仅支持尖端对齐（Tip）".into())}
  let scales=if stroke["arrow_scale"].is_null(){vec![100.0,100.0]}else{arr(&stroke["arrow_scale"])?.iter().map(|v|f(v,100.0)).collect::<R<Vec<_>>>()?};if scales.len()!=2||scales.iter().any(|s|*s<=0.0||*s>1000.0){return Err("箭头缩放比例无效或超出支持范围".into())}
 Ok((begin,end,scales))
}
// Hidden native art still carries XI binary data verbatim. Prefixing pixel CR/LF bytes corrupts it.
fn hide_art(art:&str)->R<String>{let mut out=String::new();let mut it=art.chars().peekable();while it.peek().is_some(){let mut line=String::new();while let Some(&c)=it.peek(){it.next();if c=='\r'||c=='\n'{break}line.push(c)}if line.is_empty(){continue}if !line.starts_with("%_"){out.push_str("%_")}out.push_str(&line);out.push('\r');let bare=line.strip_prefix("%_").unwrap_or(&line);if let Some(count)=bare.strip_prefix("%%BeginData: "){let n=count.trim().parse::<usize>().map_err(|_|"无效蒙版图片数据长度")?;if !(3..=128*1024*1024).contains(&n){return Err("蒙版图片数据超出范围".into())}for _ in 0..n{out.push(it.next().ok_or("蒙版图片数据不完整")?);}}}Ok(out)}

fn compound_path(node:&V)->R<V>{let mut copy=node.clone();let mut subs=Vec::new();for child in arr(&node["kind"]["children"])?{if s(&child["kind"]["type"])!="path"{return Err("复合路径只能包含路径".into())}subs.extend(arr(&child["kind"]["path"]["subpaths"])?.clone());}copy["kind"]=serde_json::json!({"type":"path","path":{"subpaths":subs},"rule":node["kind"]["rule"]});Ok(copy)}
// Bounds used only to compensate Illustrator's gradient-stroke normalization.
// The exported object remains the original editable stroked path.
fn stroke_frame_bounds(node:&V,style:&V,frame:kurbo::Affine)->R<(kurbo::Rect,kurbo::Rect)>{
 let mut path=kurbo::BezPath::new();
 for sub in arr(&node["kind"]["path"]["subpaths"])?{
  let (segments,closed)=sub_segments(sub)?;
  if let Some(a)=segments.first(){path.move_to((a[0],-a[1]));}
  for a in segments{path.curve_to((a[2],-a[3]),(a[4],-a[5]),(a[6],-a[7]));}
  if closed{path.close_path();}
 }
 let cap=match s(&style["cap"]){"Round"=>kurbo::Cap::Round,"Square"=>kurbo::Cap::Square,_=>kurbo::Cap::Butt};
 let join=match s(&style["join"]){"Round"=>kurbo::Join::Round,"Bevel"=>kurbo::Join::Bevel,_=>kurbo::Join::Miter};
 let stroke=kurbo::Stroke::new(f(&style["width"],1.0)?).with_caps(cap).with_join(join).with_miter_limit(f(&style["miter_limit"],4.0)?);
 let outline=kurbo::stroke(path.iter(),&stroke,&kurbo::StrokeOpts::default(),0.001);
 Ok((kurbo::Shape::bounding_box(&(frame*path)),kurbo::Shape::bounding_box(&(frame*outline))))
}

struct Writer<'a>{images:&'a V,font_map:&'a V,font_coverage:&'a V,ruler:[f64;2],body:String,frames:Vec<String>,stories:Vec<String>,fonts:Vec<String>,styles:Vec<String>,gradients:Vec<String>,visited:usize,mask_depth:usize}
impl Writer<'_>{
 fn line(&mut self,text:&str){self.body.push_str(text);self.body.push('\r')}
 fn meta(&mut self,node:&V,depth:usize)->R<()>{self.line(&format!("%_/ArtDictionary :\r%_{} /UnicodeString (AIArtName) ,\r%_/XMLUID : {} ; (AI10_ArtUID) ,",ps(s(&node["name"])),ps(&format!("VC_{}",node["id"]))));self.opacity_mask(node,depth)?;self.line("%_;");Ok(())}
 fn visit(&mut self,node:&V,depth:usize)->R<()>{
  self.visited+=1;if depth>64||self.visited>100000{return Err("文档对象过多或分组嵌套过深，已停止导出".into())}
  let k=&node["kind"];let kind=s(&k["type"]);
  if node["appearance"]["effects"].as_array().is_some_and(|v|!v.is_empty()){return Err(format!("对象 {} 含有暂不支持的实时效果，已停止导出",node["id"]))}
  if kind=="layer"{if k["clip"].as_bool()==Some(true)||!node["mask"].is_null(){return Err("暂不支持图层本身的裁切或透明蒙版；请先放入普通分组".into())}self.line(&format!("%AI5_BeginLayer\r{} 1 {} 1 0 0 1 0 79 128 255 0 50 0 Lb\r{} Ln\r0 A",if node["visible"].as_bool()==Some(false){0}else{1},if node["locked"].as_bool()==Some(true){0}else{1},ps(s(&node["name"]))));for child in arr(&k["children"])?{self.visit(child,depth+1)?}let own=transparency(node)?;if own!="0 1 0 0 0 Xy"{self.line(&own);self.line("0 0 Xd\r7 () XW")}self.line("LB\r%AI5_EndLayer--");return Ok(())}
  self.line(if node["locked"].as_bool()==Some(true){"1 A"}else{"0 A"});self.line(if node["visible"].as_bool()==Some(false){"1 Xw"}else{"0 Xw"});
  let own=transparency(node)?;self.line(if kind=="group"{"0 1 0 0 0 Xy"}else{&own});
  let arrow=match kind{
   "group"=>{let children=arr(&k["children"])?;let clip=k["clip"].as_bool()==Some(true);self.line(if clip{"q"}else{"u"});if clip{if children.is_empty()||!["path","compound"].contains(&s(&children[0]["kind"]["type"])){return Err("裁切组的第一个对象必须是路径或复合路径".into())}self.clip_path(&children[0])?;}for child in children.iter().skip(if clip{1}else{0}){self.visit(child,depth+1)?}self.line(if clip{"Q"}else{"U"});self.line(&own);None},
   "compound"=>{self.path(&compound_path(node)?)?},
   "path"=>self.path(node)?,"text"=>{self.text(node)?;None},"image"=>{self.image(node)?;None},_=>return Err(format!("暂不支持此对象类型：{kind}"))};
  self.meta(node,depth)?;if let Some(name)=arrow{self.line(&format!("1 {} XW",ps(&name)))}
  if kind=="text"{self.line(&own);self.line("0 J 0 j 1 w 10 M []0 d 0 XR\r0 0 Xd\r6 () XW")}if kind=="group"{if own=="0 1 0 0 0 Xy"{self.line("9 () XW")}else{self.line(&own);self.line("0 0 Xd\r6 () XW")}}Ok(())
 }
 fn clip_path(&mut self,node:&V)->R<()>{
  if s(&node["kind"]["type"])=="compound"{return self.clip_path(&compound_path(node)?)}if node["visible"].as_bool()==Some(false){return Err("暂不支持隐藏状态的裁切路径".into())}
  if !node["mask"].is_null(){return Err("暂不支持裁切路径自身的透明蒙版".into())}self.line(if node["locked"].as_bool()==Some(true){"1 A\r0 Xw\r0 1 0 0 0 Xy"}else{"0 A\r0 Xw\r0 1 0 0 0 Xy"});self.line(if s(&node["kind"]["rule"])=="EvenOdd"{"1 XR"}else{"0 XR"});
  let mut copy=node.clone();copy["appearance"]=serde_json::json!({"items":[]});for sub in copy["kind"]["path"]["subpaths"].as_array_mut().ok_or("无效裁切路径")?{sub["closed"]=V::Bool(true)}
  let start=self.body.len();self.path(&copy)?;let mut records=self.body.split_off(start);records=records.replace("\rn\r","\rh\rW\rn\r");self.body.push_str(&records);self.meta(node,0)?;Ok(())
 }
 fn opacity_mask(&mut self,node:&V,depth:usize)->R<()>{
  let mask=&node["mask"];if mask.is_null(){return Ok(())}if depth>32{return Err("蒙版嵌套过深".into())}
  fn valid(n:&V,d:usize)->bool{if d>8{return false}let t=s(&n["kind"]["type"]);(t=="path"||t=="text"||t=="image"||(t=="group"||t=="compound")&&n["kind"]["children"].as_array().is_some_and(|a|a.iter().all(|c|valid(c,d+1))))&&(n["mask"].is_null()||valid(&n["mask"]["art"],d+1))}
  if !valid(&mask["art"],0){return Err("透明蒙版对象不受支持或嵌套超过8层".into())}
  let saved=std::mem::take(&mut self.body);self.line("0 A\r0 Xw\r0 1 0 0 0 Xy\ru");self.mask_depth+=1;let result=self.visit(&mask["art"],depth+1);self.mask_depth-=1;result?;self.line("U\r0 1 0 0 0 Xy\r9 () XW");let art=std::mem::replace(&mut self.body,saved);
  self.line(&format!("%_/Mask :\r%_1 /Bool (Linked) ,\r%_{} /Bool (Inverted) ,\r%_{} /Bool (Clipping) ,\r%_{} /Bool (Disabled) ,\r%_X=",if mask["invert"].as_bool()==Some(true){1}else{0},if mask["clip"].as_bool()==Some(false){0}else{1},if mask["disabled"].as_bool()==Some(true){1}else{0}));self.body.push_str(&hide_art(&art)?);self.line("%_X+\r%_ (Art) ,\r%_; (AI9_Mask) ,");Ok(())
 }
 fn text(&mut self,node:&V)->R<()>{
  let k=&node["kind"];let text_kind=s(&k["kind"]["kind"]);if !["point","area","onpath"].contains(&text_kind){return Err("不支持此文字类型".into())}let vertical=k["vertical"].as_bool()==Some(true);
  let mut content=String::new();let mut runs=Vec::<(String,usize)>::new();
  for run in arr(&k["runs"])?{let st=&run["style"];let rotation=f(&st["rotation"],0.0)?;if rotation.abs()>360.0{return Err("字符旋转角度超出范围".into())}
   let key=format!("{}|{}",s(&st["font_family"]).trim(),s(&st["font_style"]).trim());let name=self.font_map[&key].as_str().ok_or_else(||format!("暂时无法自动识别字体「{}」的「{}」样式。请将此提示反馈给插件作者以补充自动匹配；也可使用完整工具包的独立入口指定字体映射。未生成文件，原文档不受影响。",s(&st["font_family"]),s(&st["font_style"])))?.to_string();
   if let Some(ranges)=self.font_coverage[&name].as_array(){
    let mut missing=Vec::new();for c in s(&run["text"]).chars(){let cp=c as u32;if c.is_control()||c.is_whitespace()||[0x200b,0x200c,0x200d,0xfeff].contains(&cp){continue}if !ranges.iter().any(|r|cp>=r[0].as_u64().unwrap_or(u64::MAX) as u32&&cp<=r[1].as_u64().unwrap_or(0) as u32)&&!missing.contains(&c){missing.push(c);if missing.len()==16{break}}}
    if !missing.is_empty(){return Err(format!("字体「{name}」缺少字符：{}。请为这些文字选择支持的字体后导出。",missing.iter().map(|c|c.to_string()).collect::<Vec<_>>().join(" ")))}
   }
   let index=if let Some(i)=self.fonts.iter().position(|f|f==&name){i}else{self.fonts.push(name);self.fonts.len()-1}+2;
   let size=f(&st["size"],12.0)?;if !(0.1..=1296.0).contains(&size){return Err("文字字号无效或超出支持范围".into())}
   let fill=paint(&st["fill"])?;let stroke=paint(&st["stroke"])?;
   let mut features=format!("/0 {index} /1 {} /4 {} /5 {} /6 {} /7 {} /8 {} /9 {} /56 {} /57 {} /63 {}",real(size),st["leading"].is_null(),real(f(&st["leading"],size*1.2)?),real(f(&st["h_scale"],100.0)?/100.0),real(f(&st["v_scale"],100.0)?/100.0),n(f(&st["tracking"],0.0)?),real(f(&st["baseline_shift"],0.0)?),fill.is_some(),stroke.is_some(),real(f(&st["stroke_width"],0.0)?));
   features+=&format!(" /10 {}",real(rotation));
   features+=&format!(" /12 {} /15 {} /16 {}",if st["all_caps"].as_bool()==Some(true){2}else{0},if st["strikethrough"].as_bool()==Some(true){1}else{0},if st["underline"].as_bool()==Some(true){1}else{0});
   if let Some(p)=fill{features+=&format!(" /53 {p}")}if let Some(p)=stroke{features+=&format!(" /54 {p}")}
   let text=s(&run["text"]).replace("\r\n","\r").replace(['\n','\u{2028}','\u{2029}'],"\r");let len=text.encode_utf16().count();content+=&text;runs.push((features,len));
  }
  if runs.is_empty(){return Err("文字对象中没有可导出的内容".into())}if !content.ends_with('\r'){content.push('\r');runs.last_mut().unwrap().1+=1}
  let chars=runs.iter().map(|(feat,len)|format!("<< /0 << /0 << /0 {} /5 0 /6 << {feat} >> >> >> /1 {len} >>",utf(""))).collect::<Vec<_>>().join(" ");
  let p=&k["para"];if p["hyphenate"].as_bool()==Some(true){return Err("暂不支持文字自动断词".into())}let align=match s(&p["justify"]){""|"Left"=>0,"Right"=>1,"Center"=>2,_=>return Err("暂不支持此段落对齐方式".into())};
  let features=format!("/0 {align} /1 {} /2 {} /3 {} /4 {} /5 {} /33 0 /35 0",real(f(&p["first_line_indent"],0.0)?),real(f(&p["left_indent"],0.0)?),real(f(&p["right_indent"],0.0)?),real(f(&p["space_before"],0.0)?),real(f(&p["space_after"],0.0)?));
  let paragraphs=content.split_inclusive('\r').map(|t|format!("<< /0 << /0 << /0 {} /5 << {features} >> /6 0 >> >> /1 {} >>",utf(""),t.encode_utf16().count())).collect::<Vec<_>>().join(" ");
  let id=self.stories.len();let xf=arr(&k["xf"])?;if xf.len()!=6{return Err("文字变换数据不正确".into())}let mut matrix=xf.iter().map(|v|f(v,0.0)).collect::<R<Vec<_>>>()?;matrix[4]+=self.ruler[0];matrix[5]+=self.ruler[1];
  let matrix=matrix.iter().map(|x|real(*x)).collect::<Vec<_>>().join(" ");let orientation=if vertical{"/1 2"}else{""};
  if text_kind=="point"{self.frames.push(format!("<< /0 << /0 [ 0.0 0.0 ] /2 << {orientation} /2 [ {matrix} ] >> >> >>"));}else{
   let area=text_kind=="area";let (segments,closed)=frame_segments(&k["kind"][if area{"frame"}else{"path"}])?;
   if area&&!closed{return Err("区域文字需要闭合框架".into())}
   let options=if area{
    let a=&k["area"];let rows=f(&a["rows"],1.0)?;let cols=f(&a["columns"],1.0)?;
    if rows.fract()!=0.0||cols.fract()!=0.0||!(1.0..=100.0).contains(&rows)||!(1.0..=100.0).contains(&cols){return Err("文字框行列数必须在1到100之间".into())}
    if !k["wrap"].as_array().is_none_or(|a|a.is_empty())||!a["fit"].is_null()&&s(&a["fit"])!="none"||!s(&a["verticalAlign"]).is_empty()&&s(&a["verticalAlign"])!="top"{return Err("暂不支持文字框的绕排、自动适配或非顶部对齐".into())}
    let baseline=match s(&a["firstBaseline"]){""|"ascent"|"Ascent"=>1,"capHeight"|"CapHeight"=>2,"leading"|"Leading"=>3,"xHeight"|"XHeight"=>4,"emBox"|"EmBox"=>5,"fixed"|"Fixed"=>0,_=>return Err("暂不支持此首行基线模式".into())};
    format!("/3 {} /4 {} /5 {} /7 {} /8 {} /9 {} /10 << /0 {baseline} /1 {} >>",n(rows),n(cols),s(&a["flow"])=="rows",real(f(&a["rowGutter"],f(&a["gutter"],18.0)?)?),real(f(&a["gutter"],18.0)?),real(f(&a["inset"],0.0)?),real(f(&a["firstBaselineMin"],0.0)?))
   }else{
    if f(&k["path_spacing"],0.0)?!=0.0||!s(&k["path_effect"]).is_empty()&&!["rainbow","Rainbow"].contains(&s(&k["path_effect"]))||!s(&k["path_align"]).is_empty()&&!["baseline","Baseline"].contains(&s(&k["path_align"]))||vertical{return Err("路径文字暂仅支持水平基线彩虹效果".into())}
    let start=f(&k["kind"]["start"],0.0)?;let end=f(&k["kind"]["end"],if closed{start}else{1.0})?;if !(0.0..=1.0).contains(&start)||!(0.0..=1.0).contains(&end)||!closed&&end<start{return Err("无效路径文字区间".into())}
    let end=if closed{let span=(end-start).rem_euclid(1.0);start+if span<1e-9{1.0}else{span}}else{end};format!("/6 [ {} {} ]",real(bracket(&segments,start)?),real(bracket(&segments,end)?))
   };
   let points=segments.iter().flat_map(|a|a.iter()).map(|x|real(*x)).collect::<Vec<_>>().join(" ");
   self.frames.push(format!("<< /0 << /1 << /0 [ {points} ] >> /2 << /0 {} {orientation} /2 [ {matrix} ] {options} >> >> >>",if area{1}else{2}));
  }
  self.stories.push(format!("<< /0 << /0 {} /5 << /0 [ {paragraphs} ] >> /6 << /0 [ {chars} ] >> /10 << /0 4 /2 true >> >> /1 << /0 [ << /0 {id} >> ] >> >>",utf(&content)));
  self.line(&format!("/AI11Text :\r0 /FreeUndo ,\r0 /FrameIndex ,\r{id} /StoryIndex ,\r2 /TextAntialiasing ,\r;"));Ok(())
 }
 fn gradient(&mut self,paint:&V,node:&V,stroke:Option<&V>)->R<String>{
  let g=&paint["gradient"];let radial=match s(&g["kind"]){"Linear"=>false,"Radial"=>true,_=>return Err("目前仅支持线性和径向渐变".into())};
  if g["dither"].as_bool()==Some(true)||!s(&g["method"]).is_empty()&&s(&g["method"])!="Classic"{return Err("暂不支持渐变抖动或感知插值".into())}
  let stops=arr(&g["stops"])?;if stops.len()<2||stops.len()>256{return Err("渐变需要2到256个色标".into())}let name=format!("VC Gradient {}",self.gradients.len());let mut lines=Vec::new();let mut last=-1.0;
  for stop in stops{let at=f(&stop["offset"],0.0)?;let mid=f(&stop["midpoint"],0.5)?;if at<last||!(0.0..=1.0).contains(&at)||!(0.01..=0.99).contains(&mid)||!(0.0..=1.0).contains(&f(&stop["opacity"],1.0)?)||!stop["swatch"].is_null(){return Err("暂不支持命名、无序或无效透明度的渐变色标".into())}last=at;let c=&stop["color"];let values=match s(&c["model"]){"rgb"=>format!("0 0 0 0 {} {} {} 2",n(f(&c["r"],0.0)?),n(f(&c["g"],0.0)?),n(f(&c["b"],0.0)?)),"cmyk"=>format!("{} {} {} {} 1",n(f(&c["c"],0.0)?),n(f(&c["m"],0.0)?),n(f(&c["y"],0.0)?),n(f(&c["k"],0.0)?)),_=>return Err("渐变色标目前仅支持RGB和CMYK".into())};let opacity=f(&stop["opacity"],1.0)?;let alpha=if opacity==1.0{String::new()}else{format!("{} 6 ",n(opacity))};lines.push(format!("{values} {alpha}{} {} %_Bs\r",n(mid*100.0),n(at*100.0)));}
  if f(&stops[0]["offset"],0.0)?!=0.0||f(&stops[stops.len()-1]["offset"],1.0)?!=1.0{return Err("渐变色标必须覆盖0到1的完整范围".into())}if !radial{lines.reverse()}
  self.gradients.push(format!("%AI5_BeginGradient: {}\r{} {} {} Bd\r[\r{}BD\r%AI5_EndGradient\r",ps(&name),ps(&name),if radial{1}else{0},stops.len(),lines.join("")));
  let geom=&paint["geom"];let (sx,sy,ex,ey)=if !geom.is_null(){let a=point(&geom["start"])?;let b=point(&geom["end"])?;(a[0],a[1],b[0],b[1])}else{
   let bounds=path_bounds(&node["kind"]["path"])?;
   let angle=f(&paint["angle"],0.0)?.to_radians();let (dx,dy)=(angle.cos(),-angle.sin());let (cx,cy)=((bounds[0]+bounds[2])/2.0,(bounds[1]+bounds[3])/2.0);let half=if radial{(bounds[2]-bounds[0]).max(bounds[3]-bounds[1])/2.0}else{((bounds[2]-bounds[0])*dx.abs()+(bounds[3]-bounds[1])*dy.abs())/2.0};if radial{(cx,cy,cx+half*dx,cy+half*dy)}else{(cx-half*dx,cy-half*dy,cx+half*dx,cy+half*dy)}
  };
  let dx=ex-sx;let dy=sy-ey;let len=dx.hypot(dy);if len<=0.0{return Err("渐变长度必须大于0".into())}let angle=dy.atan2(dx).to_degrees();
  if !radial{
   let (mut ox,mut oy,mut length)=(sx,-sy,len);let mut imaging=String::new();
   if let Some(style)=stroke{
    let cosine=dx/len;let sine=dy/len;let frame=kurbo::Affine::new([cosine,-sine,sine,cosine,0.0,0.0]);
    let(path,stroked)=stroke_frame_bounds(node,style,frame)?;
    if path.width()<=1e-8||stroked.width()<=1e-8{return Err("渐变描边沿渐变方向需要有效长度".into())}
    let at=frame*kurbo::Point::new(ox,oy);let adjusted=kurbo::Point::new(path.x0+(at.x-stroked.x0)*path.width()/stroked.width(),at.y);let back=frame.inverse()*adjusted;ox=back.x;oy=back.y;length*=path.width()/stroked.width();
    imaging=format!("{} {} {} {} {} {} Xm\r",n(dx),n(dy),n(dy),n(-dx),n(sx),n(-sy));
   }
   return Ok(format!("{}Bb\r1 {} {} {} {} {} 1 0 0 1 0 0 Bg\r{imaging}",if stroke.is_some(){"1 "}else{""},ps(&name),n(ox),n(oy),n(angle),n(length)))
  }
  if stroke.is_some(){return Err("径向渐变描边仍在验证，目前支持线性渐变描边".into())}
  let aspect=f(&geom["aspect"],1.0)?;if !(0.001..=1000.0).contains(&aspect){return Err("径向渐变的长宽比例无效".into())}let turn=if (aspect-1.0).abs()<1e-8{0.0}else{dy.atan2(dx)};let(c,si)=(turn.cos(),turn.sin());let ry=len*aspect;let center=[sx+self.ruler[0]-3871.5,sy+self.ruler[1]-3871.5];
  let tx=center[0]-center[0]*c-center[1]*si;let ty=center[1]+center[0]*si-center[1]*c;
  let focus=if geom["focal"].is_null(){[sx,sy]}else{point(&geom["focal"])?};let (fx,fy)=(focus[0]-sx,sy-focus[1]);let(u,v)=((c*fx+si*fy)/len,(si*fx-c*fy)/ry);let share=u.hypot(v);if share>=1.0{return Err("渐变焦点必须在椭圆内部".into())}
  Ok(format!("Bb\r{} {} {} {} Bh\r1 {} {} {} 0 {} {} {} {} {} {} {} {} Bg\r{} {} {} {} {} {} Bm\r",n(fx),n(fy),n((-v).atan2(u).to_degrees()),n(share),ps(&name),n(sx),n(-sy),n(len),number(c,10),number(-si,10),number(si,10),number(c,10),number(tx,10),number(ty,10),n(aspect),n(len*c),n(len*si),n(ry*si),n(-ry*c),n(sx),n(-sy)))
 }
 fn appearance_style(&mut self,node:&V,paints:&Vec<V>)->R<String>{
  let neutral="0 1 0 0 0 Xy\r0 J 0 j 1 w 4 M []0 d 0 XR";let mut stack=String::new();
  for p in paints.iter().rev(){if s(&p["paint"]["type"])=="none"{continue}if p["effects"].as_array().is_some_and(|a|!a.is_empty()){return Err("暂不支持填色或描边自身的特效".into())}
   let stroke=s(&p["kind"])=="stroke";let aligned=stroke&&!s(&p["align"]).is_empty()&&s(&p["align"])!="Center";let arrows=stroke&&(!p["start_arrow"].is_null()||!p["end_arrow"].is_null());
   if aligned{let subs=arr(&node["kind"]["path"]["subpaths"])?;if !["Inside","Outside"].contains(&s(&p["align"]))||subs.len()!=1||subs[0]["closed"].as_bool()!=Some(true)||arrows||s(&p["paint"]["type"])!="solid"{return Err("堆叠内外描边需要单条闭合路径和实色，不能同时含箭头".into())}}
   let mut extra=String::new();if arrows{let subs=arr(&node["kind"]["path"]["subpaths"])?;if subs.len()!=1||subs[0]["closed"].as_bool()==Some(true){return Err("箭头需要单条开放路径".into())}let(begin,end,scales)=arrow_values(p)?;extra+="/Dictionary : /NotRecorded ,\r1 /Int (BSAdvStrokeDictionaryVersion) ,\r";for (i,(which,kind)) in [("Begin",begin),("End",end)].iter().enumerate(){if !kind.is_empty(){extra+=&format!("{} /Real (BSArrow{which}Scale) ,\r/GObjRef : {} /SymbolArt ; (BSArrow{which}Symbol) ,\r",n(scales[i]),ps(&format!("VC Arrow {kind}")));}}extra+="; (kAIBeautifulStrokesParamsDictKey) ,\r";}
   if s(&p["paint"]["type"])!="solid"{return Err("多重外观目前仅支持实色填色及描边".into())}
   let paint=format!("{}\r{} Xd",color(&p["paint"]["color"],stroke)?,if stroke{"1 0"}else{"0 1"});
   let attrs=if stroke{stroke_attributes(p)?}else{String::new()};let blend=transparency(p)?;let which=if stroke{"Stroke"}else{"Fill"};let filter=if aligned{"(Adobe Stroke Offset) 1 0".to_string()}else{format!("({which} Style Filter) 0 0")};let mut prefix=String::new();if aligned{prefix+=&format!("(Illustrator.exe) /PluginFileName ,\r(Stroke Offset Live Effect) /Title ,\r2 /FillOrStroke ,\r");extra+=&format!("{} /Bool (StrokeOffsetInside) ,\r",if s(&p["align"])=="Inside"{1}else{0});}
   let fill_rule=if stroke{""}else if s(&node["kind"]["rule"])=="EvenOdd"{"1 /Bool (UseEvenOdd) ,\r"}else{"0 /Bool (UseEvenOdd) ,\r"};
   stack+=&format!("/CompoundFilter :\r(Chain Style Filter) 0 0 /Filter ,\r1 /Visible ,\r/BasicFilter :\r{filter} /Filter ,\r{} /Visible ,\r{prefix}/Dictionary : /NotRecorded ,\r/{which}Style : {neutral}\r{attrs}\r{paint}\r/Def ; ({which}Style) ,\r{extra}{fill_rule}; /Dict ; /Part ,\r/BasicFilter :\r(Blend Style Filter) 0 0 /Filter ,\r1 /Visible ,\r/Dictionary : /NotRecorded ,\r/BlendStyle : {blend}\r/Def ; (BlendStyle) ,\r; /Dict ; /Part ,\r; /Part ,\r",if p["visible"].as_bool()==Some(false){0}else{1});
  }
  let name=format!("VC Appearance {}",node["id"]);let own=transparency(node)?;
  self.styles.push(format!("/KnownStyle :\r{} /Name ,\r/ActiveStyle :\r/CompoundFilter :\r(Chain Style Filter) 0 0 /Filter ,\r1 /Visible ,\r/CompoundFilter :\r(Stack Style Filter) 0 0 /Filter ,\r1 /Visible ,\r{stack}/BasicFilter :\r(Conduit Filter) 0 0 /Filter ,\r1 /Visible ,\r; /Part ,\r; /Part ,\r/BasicFilter :\r(Blend Style Filter) 0 0 /Filter ,\r1 /Visible ,\r/Dictionary : /NotRecorded ,\r/BlendStyle : {own}\r/Def ; (BlendStyle) ,\r; /Dict ; /Part ,\r; /Execution ; /Def ;\r",ps(&name)));Ok(name)
 }
 fn path(&mut self,node:&V)->R<Option<String>>{
  let empty=Vec::new();let paints=node["appearance"]["items"].as_array().unwrap_or(&empty);
  let mut advanced=(paints.iter().any(|p|s(&p["kind"])=="fill"&&s(&p["paint"]["type"])!="none")&&paints.iter().any(|p|!p["start_arrow"].is_null()||!p["end_arrow"].is_null()))||paints.iter().filter(|p|s(&p["kind"])=="fill"&&s(&p["paint"]["type"])!="none").count()>1||paints.iter().filter(|p|s(&p["kind"])=="stroke"&&s(&p["paint"]["type"])!="none").count()>1||paints.iter().any(|p|s(&p["paint"]["type"])=="gradient"||f(&p["opacity"],1.0).unwrap_or(-1.0)!=1.0||!s(&p["blend"]).is_empty()&&s(&p["blend"])!="Normal"||p["visible"].as_bool()==Some(false));
  let mut fill=None;let mut stroke=None;
  for p in paints{if p["effects"].as_array().is_some_and(|a|!a.is_empty()){return Err("暂不支持填色或描边自身的特效".into())}if !["fill","stroke"].contains(&s(&p["kind"])){return Err("暂不支持此对象外观".into())}if s(&p["paint"]["type"])=="none"{continue}if !["solid","gradient"].contains(&s(&p["paint"]["type"])){return Err("暂不支持此路径填色".into())}let slot=if s(&p["kind"])=="fill"{&mut fill}else{&mut stroke};if slot.is_some()&&!advanced{return Err("不支持此外观组合".into())}*slot=Some(p);}
  let subs=arr(&node["kind"]["path"]["subpaths"])?;
  let gradient_fill=fill.is_some_and(|p|s(&p["paint"]["type"])=="gradient");
  let gradient_stroke=stroke.is_some_and(|p|s(&p["paint"]["type"])=="gradient");
  if paints.iter().any(|p|s(&p["paint"]["type"])=="gradient"){
   if paints.iter().filter(|p|s(&p["kind"])=="fill"&&s(&p["paint"]["type"])!="none").count()>1||paints.iter().filter(|p|s(&p["kind"])=="stroke"&&s(&p["paint"]["type"])!="none").count()>1{return Err("渐变与多重外观组合的原生位置仍在验证，请先分开导出".into())}
   for paint in paints.iter().filter(|p|s(&p["paint"]["type"])!="none"){
    if transparency(paint)?!="0 1 0 0 0 Xy"||paint["visible"].as_bool()==Some(false){return Err("暂不支持渐变外观项的单独透明度、混合或隐藏".into())}
   }
   if let Some(style)=stroke{if !s(&style["align"]).is_empty()&&s(&style["align"])!="Center"||!style["start_arrow"].is_null()||!style["end_arrow"].is_null()||!s(&style["gradient_mode"]).is_empty()&&s(&style["gradient_mode"])!="Within"||!style["dash"].is_null(){return Err("渐变描边目前支持中心对齐、路径内部渐变及实线".into())}}
   advanced=false;
  }
  let gradient=if gradient_fill{Some(self.gradient(&fill.ok_or("缺少渐变填色")?["paint"],node,None)?)}else{None};
  let stroke_gradient=if gradient_stroke{let style=stroke.ok_or("缺少渐变描边")?;stroke_attributes(style)?;if subs.len()!=1||f(&style["width"],1.0)?<=0.0{return Err("渐变描边需要一条有效路径和正线宽".into())}Some(self.gradient(&style["paint"],node,Some(style))?)}else{None};
  let mut arrow=if advanced{Some(self.appearance_style(node,paints)?)}else{None};
  if !advanced{if let Some(st)=stroke{if !s(&st["align"]).is_empty()&&s(&st["align"])!="Center"{
   if !["Inside","Outside"].contains(&s(&st["align"]))||subs.len()!=1||subs[0]["closed"].as_bool()!=Some(true)||!st["start_arrow"].is_null()||!st["end_arrow"].is_null(){return Err("内侧或外侧描边目前需要单条闭合路径，且不能同时包含箭头。".into())}
   let id=node["id"].to_string();let inside=s(&st["align"])=="Inside";
   let template=include_str!("templates/stroke-offset.pgf");
   let fill_style=if let Some(p)=fill{format!("{}\r0 1 Xd",color(&p["paint"]["color"],false)?)}else{"0 0 Xd".to_string()};
   self.styles.push(template.replace("__ID__",&id).replace("__DISPLAY__",if inside{"Inside"}else{"Outside"}).replace("__INSIDE__",if inside{"1"}else{"0"}).replace("__STROKE_ATTRIBUTES__",&stroke_attributes(st)?).replace("__STROKE_COLOR__",&color(&st["paint"]["color"],true)?).replace("__FILL_COLOR__\r0 1 Xd",&fill_style));
   arrow=Some(format!("VC Stroke Alignment {id}"));
  }}}
  if !advanced{if let Some(st)=stroke{stroke_attributes(st)?;if !st["start_arrow"].is_null()||!st["end_arrow"].is_null(){if fill.is_some()||subs.len()!=1||subs[0]["closed"].as_bool()==Some(true){return Err("动态箭头需要单条开放路径，且不能有填色".into())}arrow=Some(self.arrow(node,st)?);}}}
  self.line(if s(&node["kind"]["rule"])=="EvenOdd"{"1 XR"}else{"0 XR"});
  if arrow.is_some(){self.line("0 Ae\ru\rU\r0 0 Xd\r6 () XW")}else{self.line("0 O 0 R 0 J 0 j 1 w 4 M []0 d");if let Some(p)=fill{if gradient_fill{self.line("0 g")}else{self.line(&color(&p["paint"]["color"],false)?)}}if let Some(p)=stroke{if gradient_stroke{self.line("0 G")}else{self.line(&color(&p["paint"]["color"],true)?)};self.line(&stroke_attributes(p)?)}}
  let prefix=if arrow.is_some(){"%_"}else{""};if subs.len()>1{self.line("*u")}
  for sub in subs{let anchors=arr(&sub["anchors"])?;if anchors.is_empty(){return Err("文档中存在空路径".into())}self.line(&format!("{prefix}{} m",pair(&anchors[0]["p"])?));
   let closed=sub["closed"].as_bool()==Some(true);let mut edges:Vec<(&V,&V)>=anchors.windows(2).map(|w|(&w[0],&w[1])).collect();if closed{edges.push((anchors.last().unwrap(),&anchors[0]))}
   for(prev,next)in edges{let end=pair(&next["p"])?;if !prev["out"].is_null()||!next["in"].is_null(){let a=if prev["out"].is_null(){&prev["p"]}else{&prev["out"]};let b=if next["in"].is_null(){&next["p"]}else{&next["in"]};self.line(&format!("{prefix}{} {} {end} C",pair(a)?,pair(b)?))}else{self.line(&format!("{prefix}{end} L"))}}
   if let Some(instance)=&gradient{if std::ptr::eq(sub,subs.last().ok_or("空渐变路径")?){self.line(instance);if stroke_gradient.is_some(){self.line(if closed{"2 BB"}else{"1 BB"})}}}
   if let Some(instance)=&stroke_gradient{if std::ptr::eq(sub,subs.last().ok_or("空渐变描边")?){self.line(instance)}}
   let op=if arrow.is_some(){if closed{"n"}else{"N"}}else{match(fill.is_some(),stroke.is_some(),closed){(true,true,true)=>"b",(true,true,false)=>"B",(true,false,true)=>"f",(true,false,false)=>"F",(false,true,true)=>"s",(false,true,false)=>"S",_=>"n"}};self.line(&format!("{prefix}{op}"));if (gradient.is_some()||stroke_gradient.is_some())&&std::ptr::eq(sub,subs.last().ok_or("空渐变路径")?){self.line(match(stroke.is_some(),closed){(true,true)=>"2 BB",(true,false)=>"1 BB",_=>"0 BB"})}
  }if subs.len()>1{self.line("*U")}Ok(arrow)
 }
 fn arrow(&mut self,node:&V,stroke:&V)->R<String>{
  let(begin,end,scales)=arrow_values(stroke)?;
  let template=if begin.is_empty(){include_str!("templates/arrow-end.pgf")}else if end.is_empty(){include_str!("templates/arrow-begin.pgf")}else{include_str!("templates/arrow-both.pgf")};let id=node["id"].to_string();let name=format!("VC Arrow Style {id}");
  self.styles.push(template.replace("__ID__",&id).replace("__BEGIN_KIND__",begin).replace("__END_KIND__",end).replace("__BEGIN_SCALE__",&n(scales[0])).replace("__END_SCALE__",&n(scales[1])).replace("__STROKE_ATTRIBUTES__",&stroke_attributes(stroke)?).replace("__COLOR__",&color(&stroke["paint"]["color"],true)?));Ok(name)
 }
 fn image(&mut self,node:&V)->R<()>{
  let k=&node["kind"];let asset=&self.images[s(&k["key"])];
  let format=match s(&asset["mime"]){"image/png"=>image::ImageFormat::Png,"image/jpeg"=>image::ImageFormat::Jpeg,"image/webp"=>image::ImageFormat::WebP,_=>return Err("目前支持 PNG、JPEG 和 WebP 图片，请将其他格式转换后重试".into())};
  let encoded=asset["data"].as_str().ok_or("VectorCraft 未向插件提供这张图片的数据，无法完整导出。请先保存文档，再使用完整工具包中的 Run-Independent.cmd 独立导出。未生成文件，原文档不受影响。")?;
  let bytes=STANDARD.decode(encoded).map_err(|_|"图片编码不正确，无法读取")?;
  if image::guess_format(&bytes).ok()!=Some(format){return Err("图片实际格式与文档记录不一致，请重新插入图片后重试".into())}
  let mut reader=image::ImageReader::with_format(std::io::Cursor::new(bytes),format);let mut limits=image::Limits::default();limits.max_alloc=Some(128*1024*1024);limits.max_image_width=Some(25000000);limits.max_image_height=Some(25000000);reader.limits(limits.clone());
  let (w,h)=reader.into_dimensions().map_err(|_|"无法读取图片尺寸，请检查图片是否损坏")?;
  if w==0||h==0||(w as u64)*(h as u64)>25000000{return Err("图片超过 2500 万像素的导出限制".into())}
  if f(&k["width"],0.0)?!=w as f64||f(&k["height"],0.0)?!=h as f64{return Err("图片尺寸与文档记录不一致，请重新插入图片后重试".into())}
  let bytes=STANDARD.decode(encoded).map_err(|_|"图片编码不正确")?;let mut reader=image::ImageReader::with_format(std::io::Cursor::new(bytes),format);reader.limits(limits);
  let data=reader.decode().map_err(|_|"图片解码失败，请检查图片是否损坏或过大")?.to_rgba8();
  if self.mask_depth>0&&data.as_raw().chunks_exact(4).any(|p|p[0]!=p[1]||p[1]!=p[2]){return Err("蒙版图片目前仅支持灰度内容，请先将蒙版图转为灰度后导出".into())}
  let mut rgb=Vec::with_capacity((w*h*3)as usize);let mut alpha=Vec::with_capacity((w*h)as usize);for p in data.as_raw().chunks_exact(4){rgb.extend_from_slice(&p[..3]);alpha.push(p[3]);}
  let xf=arr(&k["xf"])?;if xf.len()!=6{return Err("图片变换数据不正确".into())}let mut x=xf.iter().map(|v|f(v,0.0)).collect::<R<Vec<_>>>()?;for i in [1,2,5]{x[i]=-x[i]}let matrix=x.iter().map(|v|n(*v)).collect::<Vec<_>>().join(" ");self.line(&format!("%AI5_File:\r%AI5_BeginRaster\r() 0 XG\r/DeviceRGB XN\r[ {matrix} ] {w} {h} 0 Xh\r[ {matrix} ] 0 0 {w} {h} {w} {h} 8 3 1 17 1 0 4 4 0 0\r%%BeginData: {}",rgb.len()+if self.mask_depth>0{alpha.len()}else{0}+3));self.body.push_str("XI\n");self.body.extend(rgb.into_iter().chain(alpha).map(char::from));self.line("%%EndData\rXH\r%AI5_EndRaster\rN");Ok(())
 }
 fn text_doc(&self,typed:bool)->R<String>{
  let defaults:V=serde_json::from_str(include_str!("../../native/proof-defaults.json")).map_err(|e|e.to_string())?;let ch=s(&defaults["character"]);let para=s(&defaults["paragraph"]);let mut fonts=vec!["MyriadPro-Regular".to_string(),"AdobeInvisFont".to_string()];fonts.extend(self.fonts.clone());let entries=fonts.iter().enumerate().map(|(i,name)|format!("<< /0 << /99 /CoolTypeFont /0 << /0 {} /2 {} >> >> >>",utf(name),if i<2{0}else{1})).collect::<Vec<_>>().join(" ");let map=(0..fonts.len()).map(|i|format!("<< /0 {i} >>")).collect::<Vec<_>>().join(" ");
  let frames=if typed{format!(" /8 << /0 [ {} ] >>",self.frames.join(" "))}else{String::new()};let stories=if typed{format!(" /1 [ {} ]",self.stories.join(" "))}else{String::new()};
  Ok(format!(" /98 << /0 14 >> /0 << /1 << /0 [ {entries} ] /1 [ {map} ] >> /5 << /0 [ << /0 << /0 {} /6 << {ch} >> >> >> ] /1 [ << /0 0 >> ] >> /6 << /0 [ << /0 << /0 {} /5 << {para} >> >> >> ] /1 [ << /0 0 >> ] >> {frames} >> /1 << /0 << /1 0 /2 0 /3 .583 /4 .333 /5 .583 /6 .333 /7 .7 /8 true /11 6 /16 true /17 0 >> {stories} /2 << {ch} >> /3 << {para} >> >>",utf("[Normal Character Style]"),utf("[Normal Paragraph Style]")))
 }
}

pub fn write(payload:&V,font_overrides:&V)->R<Vec<u8>>{
 let mut fonts:V=serde_json::from_str(include_str!("../../native/font-map.json")).map_err(|_|"内置字体表读取失败，请重新安装插件")?;
 let overrides=font_overrides.as_object().ok_or("高级字体映射必须是 JSON 对象，可留空或填写 {}")?;
 for(key,value)in overrides{let name=value.as_str().ok_or("字体内部名称必须是文字")?;if name.is_empty()||!name.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'){return Err(format!("字体「{key}」的内部名称无效，请检查独立入口的字体映射文件"))}fonts[key]=value.clone();}
 let font_map=&fonts;
 if s(&payload["format"])!="vectorcraft"||payload["version"].as_u64()!=Some(4){return Err("目前仅支持 VectorCraft 第 4 版原生文档格式".into())}if !font_map.is_object(){return Err("高级字体映射必须是 JSON 对象，可留空或填写 {}".into())}
 let coverage:V=serde_json::from_str(include_str!("../../native/font-coverage.json")).map_err(|_|"内置字形表读取失败")?;
 let doc=&payload["document"];let boards=arr(&doc["artboards"])?;let layers=arr(&doc["layers"])?;if boards.is_empty(){return Err("文档中没有画板".into())}let cmyk=match s(&doc["color_mode"]){"Rgb"=>false,"Cmyk"=>true,_=>return Err("目前仅支持 RGB 或 CMYK 文档".into())};
 let mut bounds=[f64::INFINITY,f64::INFINITY,f64::NEG_INFINITY,f64::NEG_INFINITY];for b in boards{let r=&b["rect"];let rect=[f(&r["x0"],0.0)?, -f(&r["y1"],0.0)?, f(&r["x1"],0.0)?, -f(&r["y0"],0.0)?];if rect[2]<=rect[0]||rect[3]<=rect[1]{return Err("画板尺寸或坐标不正确".into())}bounds[0]=bounds[0].min(rect[0]);bounds[1]=bounds[1].min(rect[1]);bounds[2]=bounds[2].max(rect[2]);bounds[3]=bounds[3].max(rect[3]);}
 let cx=bounds[2]/2.0+0.5;let cy=bounds[1]/2.0-0.5;let ruler=[8191.5-cx,8191.5+cy];let mut w=Writer{images:&payload["images"],font_map,font_coverage:&coverage,ruler,body:String::new(),frames:vec![],stories:vec![],fonts:vec![],styles:vec![],gradients:vec![],visited:0,mask_depth:0};for layer in layers{w.visit(layer,0)?}
 let bbox=bounds.iter().map(|x|n(*x)).collect::<Vec<_>>().join(" ");let mut out=format!("%!PS-Adobe-3.0 \r%%Creator: VectorCraft Native AI Exporter\r%%AI8_CreatorVersion: 30.0.0\r%%Title: {}\r%%BoundingBox: {} {} {} {}\r%%HiResBoundingBox: {bbox}\r%%Canvassize: 16383\r%%DocumentProcessColors: Cyan Magenta Yellow Black\r%AI5_FileFormat 14.0\r%AI12_BuildNumber: 1\r%AI3_ColorUsage: Color\r%AI3_TemplateBox: {cx} {cy} {cx} {cy}\r%AI3_TileBox: {bbox}\r%AI3_Cropmarks: {bbox}\r%AI3_DocumentPreview: None\r%AI5_ArtSize: 14400 14400\r%AI5_RulerUnits: 2\r%AI24_LargeCanvasScale: 1\r%AI9_ColorModel: {}\r%AI5_ArtFlags: 0 0 0 1 0 0 1 0 0\r%AI5_TargetResolution: 800\r%AI5_NumLayers: {}\r%AI9_OpenToView: -100 100 1 1500 833 18 1 0 6 58 0 0 0 1 1 0 1 1 0 0\r%%PageOrigin:0 {}\r%%EndComments\r%%BeginProlog\r%%EndProlog\r%%BeginSetup\r%AI9_BeginDocumentData\r%_/Document :\r%_/Dictionary :\r%_0 /Int (CropAreaActive) ,\r%_/Array :\r",ps(s(&doc["title"])),bounds[0].floor(),bounds[1].floor(),bounds[2].ceil(),bounds[3].ceil(),if cmyk{2}else{1},layers.len(),n(bounds[1]));
 for(i,b)in boards.iter().enumerate(){let r=&b["rect"];let x=f(&r["x0"],0.0)?;let y=f(&r["y0"],0.0)?;out+=&format!("%_/Dictionary :\r%_{} {} /RealPointRelToROrigin\r%_ (PositionPoint1) ,\r%_{} {} /RealPointRelToROrigin\r%_ (PositionPoint2) ,\r%_0 /Bool (IsArtboardDefaultName) ,\r%_0 /Bool (IsArtboardSelected) ,\r%_0 /Int (DisplayMark) ,\r%_{} {} /RealPoint\r%_ (RulerOrigin) ,\r%_(00000000-0000-4000-b000-{:012}) /String (ArtboardUUID) ,\r%_1 /Real (PAR) ,\r%_{} /UnicodeString (Name) ,\r%_; ,\r",n(x),n(-y),n(f(&r["x1"],0.0)?),n(-f(&r["y1"],0.0)?),(ruler[0]+x).floor(),(ruler[1]+y).floor(),i+1,ps(s(&b["name"])));}
 out+="%_; (ArtboardArray) ,\r%_; /Recorded ,\r%_;\r%AI9_EndDocumentData\r";
 if !w.gradients.is_empty(){out+=&w.gradients.join("");}
 if !w.styles.is_empty(){out+="%AI5_Begin_NonPrinting\r%AI9_BeginArtStyles\r";out+=&w.styles.join("");out+="%AI9_EndArtStyles\r%AI5_End_NonPrinting--\r";out+=include_str!("templates/symbols.pgf");}
 for name in &w.fonts{out+=&format!("%AI55J_Tsume: None\r%AI3_BeginEncoding: _{name} {name}\r[/_{name}/{name} 0 {} 0 TZ\r%AI3_EndEncoding TrueType\r",if name=="MicrosoftYaHei"{25}else{0});}
 out+="%AI11_BeginTextDocument\r/AI11TextDocument : /ASCII85Decode ,\r";out+=&ascii85(&latin(&w.text_doc(true)?));out+=&format!("{} {} /RulerOrigin ,\r;\r/AI11UndoFreeTextDocument : /ASCII85Decode ,\r",n(ruler[0]),n(ruler[1]));out+=&ascii85(&latin(&w.text_doc(false)?));out+=";\r%AI11_EndTextDocument\r%%EndSetup\r";out+=&w.body;out+="%%PageTrailer\rgsave annotatepage grestore showpage\r%%Trailer\r%%EOF\r";Ok(latin(&out))
}

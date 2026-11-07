import {strokeAttributes} from './stroke-attributes.mjs';
import {checkKnownGlyphs} from './font-check.mjs';
// Experimental native PGF + Unicode Txt2 writer. No Illustrator or filesystem calls.
// Txt2 field meanings and document template: ai-file (MIT), see THIRD_PARTY.md.
import { emptyStreamText } from 'ai-file';
import {real,writeTypedTxt2} from './txt2.mjs';
import {freshTextDocuments} from './proof-text.mjs';
import {arrowStyle,arrowSymbols} from './arrows.mjs';
import {alignedStrokeStyle} from './stroke-offset.mjs';
import builtInFontMap from './font-map.json' with {type:'json'};

// Txt2's native reader constructs typed instances as it reads: type/UUID must precede fields.
const M = obj => new Map(Object.entries(obj).sort(([a],[b])=>({99:-2,97:-1}[a]??0)-({99:-2,97:-1}[b]??0)));
const N = value => {
  if (!Number.isFinite(value) || Math.abs(value) > 16000000) throw Error('Invalid or excessive coordinate');
  return String(Number(value.toFixed(6)));
};
const S = value => '(' + Buffer.from(String(value), 'utf8').toString('latin1').replace(/[\\()]/g, x => '\\' + x).replace(/[\x00-\x1f\x7f-\xff]/g, x => '\\' + x.charCodeAt(0).toString(8).padStart(3, '0')) + ')';
const point = p => `${N(p[0])} ${N(-p[1])}`;

export function ascii85(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 4) {
    const length = Math.min(4, bytes.length - i);
    let value = 0;
    for (let j = 0; j < 4; j++) value = value * 256 + (j < length ? bytes[i+j] : 0);
    if (value === 0 && length === 4) { out += 'z'; continue; }
    let word = '';
    for (let j = 0; j < 5; j++) { word = String.fromCharCode(value % 85 + 33) + word; value = Math.floor(value / 85); }
    out += word.slice(0, length + 1);
  }
  return out + '~>';
}

export function ascii85Lines(bytes){
  // Adobe requires the EOD pair '~>' to be contiguous; never wrap between its two bytes.
  return (ascii85(bytes).slice(0,-2).match(/.{1,100}/g)||['']).map(s=>'% '+s).join('\r')+'~>';
}

function color(c, stroke = false) {
  if (!c) throw Error('Missing color');
  if (c.model === 'rgb') return `0 0 0 0 ${[c.r,c.g,c.b].map(N).join(' ')} ${stroke ? 'XA' : 'Xa'}`;
  if (c.model === 'cmyk') return `${[c.c,c.m,c.y,c.k].map(N).join(' ')} ${stroke ? 'K' : 'k'}`;
  if (c.model === 'gray') return `${N(c.gray ?? c.k ?? c.value)} ${stroke ? 'G' : 'g'}`;
  throw Error('Unsupported color model: ' + c.model);
}

function textPaint(p) {
  if (!p || p.type === 'none') return null;
  if (p.type !== 'solid') throw Error('Text gradient/pattern is not implemented');
  const c = p.color;
  let type, values;
  if (c.model === 'rgb') { type = 1; values = [c.r,c.g,c.b]; }
  else if (c.model === 'cmyk') { type = 2; values = [c.c,c.m,c.y,c.k]; }
  else if (c.model === 'gray') { type = 0; values = [c.gray ?? c.k ?? c.value]; }
  else throw Error('Unsupported text color');
  values.forEach(N);
  return M({99:{name:'SimplePaint'},0:M({0:type,1:[1,...values].map(real)})});
}

export function nativeStream(payload, assets = {}, fontMap = {}, textSchema) {
  if (payload.format !== 'vectorcraft' || payload.version !== 4) throw Error('Only VectorCraft format version 4 is supported');
  const doc = payload.document;
  if (!doc?.artboards?.length || !Array.isArray(doc.layers)) throw Error('Missing document/artboards');
  if (doc.color_mode !== 'Rgb' && doc.color_mode !== 'Cmyk') throw Error('Unsupported document color mode');
  const fonts = [], frames = [], stories = [], body = [];
  const arrowStyles=[],arrowKinds=[],arrowNames=new Map();
  const counts = {layer:0,group:0,path:0,text:0,image:0};
  let visited = 0;
  const line = text => body.push(Buffer.from(text + '\r', 'latin1'));
  const meta = node => {
    line('%_/ArtDictionary :');
    line(`%_${S(node.name || 'VC_' + node.id)} /UnicodeString (AIArtName) ,`);
    line(`%_/XMLUID : ${S('VC_' + node.id)} ; (AI10_ArtUID) ,`);
    line('%_;');
  };
  function text(node) {
    const k = node.kind, id = stories.length;
    if (k.kind?.kind !== 'point') throw Error('Only point text is implemented: #' + node.id);
    if (!k.runs?.length) throw Error('Empty text runs: #' + node.id);
    const xf = k.xf || [1,0,0,1,0,0]; xf.forEach(N);
    const chars = [];
    let content = '';
    for (const run of k.runs) {
      const s = run.style;
      if (s.rotation || s.underline || s.strikethrough || s.all_caps) throw Error('Unsupported character decoration: #' + node.id);
      const key = `${s.font_family.trim()}|${s.font_style.trim()}`;
      const name = fontMap[key] || builtInFontMap[key];
      if (!name) throw Error('Add an explicit PostScript font mapping for ' + key);
      checkKnownGlyphs(name,run.text);
      let index = fonts.findIndex(f => f === name);
      if (index < 0) { index = fonts.length; fonts.push(name); }
      const fill = textPaint(s.fill), stroke = textPaint(s.stroke);
      const features = M({0:index,1:real(s.size),4:s.leading === undefined,5:real(s.leading ?? s.size * 1.2),
        6:real((s.h_scale ?? 100)/100),7:real((s.v_scale ?? 100)/100),8:s.tracking || 0,9:real(s.baseline_shift || 0),
        56:!!fill,57:!!stroke,63:real(s.stroke_width || 0)});
      if (fill) features.set('53', fill);
      if (stroke) features.set('54', stroke);
      const value = run.text.replace(/\r\n|\n|\u2028|\u2029/g, '\r');
      content += value;
      chars.push(M({0:M({0:M({6:features})}),1:value.length}));
    }
    if (!content.endsWith('\r')) { content += '\r'; chars.at(-1).set('1', chars.at(-1).get('1') + 1); }
    // No cached glyph indices: the receiving text engine must compose the Unicode story.
    const para = k.para || {};
    const justification = {Left:0,Right:1,Center:2}[para.justify || 'Left'];
    if (justification === undefined || para.hyphenate) throw Error('Unsupported paragraph setting');
    const paragraphs = M({0:[M({0:M({0:M({5:M({0:justification,1:real(para.first_line_indent||0),2:real(para.left_indent||0),3:real(para.right_indent||0),4:real(para.space_before||0),5:real(para.space_after||0)})})}),1:content.length})]});
    frames.push(M({0:M({0:[0,0].map(real),2:M({2:xf.map(real)})})}));
    const layout = M({99:{name:'PC'},6:[M({99:{name:'F'},10:id,6:[M({99:{name:'L'},6:[M({99:{name:'S'},15:M({0:content.length}),6:[]})]})]})]});
    stories.push(M({0:M({0:content,5:paragraphs,6:M({0:chars})}),1:M({0:[M({0:id})],2:[layout]})}));
    line(`/AI11Text :\r0 /FreeUndo ,\r0 /FrameIndex ,\r${id} /StoryIndex ,\r2 /TextAntialiasing ,\r;`);
  }
  function path(node) {
    const paints = node.appearance?.items || [];
    if (paints.some(p => !['fill','stroke'].includes(p.kind) || (p.paint?.type !== 'none' && p.paint?.type !== 'solid'))) throw Error('Only solid path fill/stroke is implemented');
    const fills = paints.filter(p=>p.kind==='fill' && p.paint?.type!=='none');
    const strokes = paints.filter(p=>p.kind==='stroke' && p.paint?.type!=='none');
    if (fills.length > 1 || strokes.length > 1) throw Error('Multiple appearances are not implemented');
    const subs = node.kind.path.subpaths;
    const arrow=strokes.find(p=>p.start_arrow||p.end_arrow);
    const aligned=strokes.find(p=>p.align&&p.align!=='Center');
    if(aligned&&(!['Inside','Outside'].includes(aligned.align)||subs.length!==1||!subs[0].closed||arrow))throw Error('内侧或外侧描边目前需要单条闭合路径，且不能同时包含箭头。');
    if(paints.some(p=>(p.start_arrow||p.end_arrow)&&p!==arrow))throw Error('Arrows require one visible solid stroke');
    strokes.forEach(p=>strokeAttributes(p,N));
    if(aligned){
      const record=alignedStrokeStyle(node.id,aligned,fills[0],{number:N,quote:S,color});
      arrowStyles.push(record.style);arrowNames.set(node.id,record.name);
      line('0 Ae\ru\rU\r0 0 Xd\r6 () XW');
    }else if(arrow){
      if(fills.length||subs.length!==1||subs[0].closed)throw Error('Native arrows require one open unfilled path');
      const record=arrowStyle(node.id,arrow,{number:N,quote:S,color});
      arrowStyles.push(record.style);arrowKinds.push(...record.kinds);arrowNames.set(node.id,record.name);
      line('0 Ae\ru\rU\r0 0 Xd\r6 () XW');
    }else{
      line('0 O 0 R 0 J 0 j 1 w 4 M [] 0 d 0 XR');
      if (fills.length) line(color(fills[0].paint.color));
      if (strokes.length) { const p=strokes[0]; line(color(p.paint.color,true)); line(strokeAttributes(p,N)); }
    }
    const styled=arrow||aligned;
    const emit=value=>line((styled?'%_':'')+value);
    if (subs.length > 1) line('*u');
    for (const sub of subs) {
      const a = sub.anchors;
      if (!a.length) throw Error('Empty subpath');
      emit(point(a[0].p) + ' m');
      const edge = (prev, next) => emit(prev.out || next.in ? `${point(prev.out || prev.p)} ${point(next.in || next.p)} ${point(next.p)} C` : point(next.p) + ' L');
      for (let i=1;i<a.length;i++) edge(a[i-1],a[i]);
      if (sub.closed) edge(a.at(-1),a[0]);
      const op = fills.length && strokes.length ? 'b' : fills.length ? 'f' : strokes.length ? 's' : 'n';
      emit(styled?(sub.closed?'n':'N'):sub.closed ? op : op.toUpperCase());
    }
    if (subs.length > 1) line('*U');
  }
  function image(node) {
    const k=node.kind, asset=assets[k.key];
    if (!asset) throw Error('Missing decoded image: ' + k.key);
    const {width,height,data}=asset;
    if (width!==k.width || height!==k.height || data.length!==width*height*4) throw Error('Image dimensions/data mismatch');
    const x=k.xf; x.forEach(N);
    const matrix=[x[0],-x[1],-x[2],x[3],x[4],-x[5]].map(N).join(' ');
    const rgb=Buffer.alloc(width*height*3), alpha=Buffer.alloc(width*height);
    for(let i=0;i<alpha.length;i++){ rgb.set(data.subarray(i*4,i*4+3),i*3); alpha[i]=data[i*4+3]; }
    line('%AI5_File:\r%AI5_BeginRaster\r() 0 XG\r/DeviceRGB XN');
    line(`[ ${matrix} ] ${width} ${height} 0 Xh`);
    line(`[ ${matrix} ] 0 0 ${width} ${height} ${width} ${height} 8 3 1 17 1 0 4 4 0 0`);
    line(`%%BeginData: ${rgb.length+3}`);
    body.push(Buffer.from('XI\n'),rgb,alpha,Buffer.from('%%EndData\r'));
    line('XH\r%AI5_EndRaster\rN');
  }
  function visit(node, depth=0) {
    if (++visited>100000 || depth>64) throw Error('Document exceeds object/depth limit');
    const k=node.kind;
    if (!(k?.type in counts)) throw Error('Unsupported object kind: ' + k?.type);
    if (node.mask || k.clip || (node.opacity!==undefined && node.opacity!==1) || node.blend_mode || node.appearance?.effects?.length) throw Error('Mask, clip, transparency or effect not implemented: #' + node.id);
    counts[k.type]++;
    if (k.type==='layer') {
      line(`%AI5_BeginLayer\r${node.visible===false?0:1} 1 ${node.locked?0:1} 1 0 0 1 0 79 128 255 0 50 0 Lb\r${S(node.name || 'Layer')} Ln\r0 A`);
      for (const child of k.children) visit(child,depth+1);
      line('LB\r%AI5_EndLayer--'); return;
    }
    line(`${node.locked?1:0} A`);
    line(`${node.visible===false?1:0} Xw`);
    if (k.type==='group') { line('u'); for(const child of k.children) visit(child,depth+1); line('U'); }
    else if(k.type==='text') text(node);
    else if(k.type==='path') path(node);
    else if(k.type==='image') image(node);
    meta(node);
    if(arrowNames.has(node.id))line(`1 ${S(arrowNames.get(node.id))} XW`);
    if(k.type==='text')line('0 1 0 0 0 Xy\r0 J 0 j 1 w 10 M []0 d 0 XR\r0 0 Xd\r6 () XW');
    if(k.type==='group')line('9 () XW');
  }
  for (const layer of doc.layers) visit(layer);
  let root=M({0:M({1:M({0:fonts.map(f=>M({0:M({99:{name:'CoolTypeFont'},0:M({0:f,2:1})})}))}),8:M({0:frames})}),1:M({1:stories,2:M({1:12})})});
  if(textSchema) {
    // Developer experiment: retain complete engine resource tables from a synthetic reference.
    const revive=v=>Array.isArray(v)?v.map(revive):v&&typeof v==='object'&&!('raw'in v)&&!('name'in v)?new Map(Object.entries(v).map(([k,x])=>[k,revive(x)])):v;
    const sourceSchema=textSchema.root || textSchema;
    const template=sourceSchema instanceof Map?structuredClone(sourceSchema):revive(structuredClone(sourceSchema));
    const resources=template.get('0'),engine=template.get('1');
    const referenceFrame=structuredClone(resources.get('8').get('0')[0]);
    const referenceStory=structuredClone(engine.get('1')[0]);
    const referenceStories=structuredClone(engine.get('1'));
    const referenceFrames=structuredClone(resources.get('8').get('0'));
    const originalFonts=resources.get('1').get('0');
    const fontIndices=fonts.map((name,i)=>{
      let index=originalFonts.findIndex(entry=>entry.get('0').get('0').get('0')===name);
      if(index<0){index=originalFonts.length;originalFonts.push(M({0:M({99:{name:'CoolTypeFont'},0:M({0:name,2:1}),97:{raw:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`}})}));}
      return index;
    });
    const numeric=v=>v?.raw?.startsWith('~VC_REAL~')?Number(v.raw.slice(9)):v;
    const same=(a,b)=>JSON.stringify(a,(_,v)=>numeric(v))===JSON.stringify(b,(_,v)=>numeric(v));
    const templates=stories.map(story=>{
      const index=story.get('0').get('6').get('0')[0].get('0').get('0').get('6').get('0');
      return referenceStories.find(s=>s.get('0').get('6').get('0')[0].get('0').get('0').get('6').get('0')===fontIndices[index]) || referenceStory;
    });
    resources.get('8').set('0',frames.map((frame,i)=>{
      const sourceId=templates[i].get('1').get('0')[0].get('0');
      const copy=structuredClone(referenceFrames[sourceId] || referenceFrame);
      copy.get('0').get('2').set('2',frame.get('0').get('2').get('2'));
      copy.get('0').set('97',{raw:`00000000-0000-4000-9000-${String(i+1).padStart(12,'0')}`});return copy;
    }));
    const completeStories=stories.map((story,i)=>{
      const templateStory=templates[i];
      const copy=structuredClone(templateStory),model=copy.get('0'),generated=story.get('0');
      model.set('0',generated.get('0'));
      const referenceRun=templateStory.get('0').get('6').get('0')[0];
      model.set('6',M({0:generated.get('6').get('0').map((run,runIndex)=>{
        const next=structuredClone(referenceRun),style=next.get('0').get('0');
        style.set('97',{raw:`00000000-0000-4000-a000-${String(i*1000+runIndex+1).padStart(12,'0')}`});
        const desired=structuredClone(run.get('0').get('0').get('6'));
        desired.set('0',fontIndices[desired.get('0')]);
        const features=structuredClone(style.get('6'));
        const defaults=engine.get('2');
        for(const [key,value]of desired){
          const current=features.has(key)?features.get(key):defaults.get(key);
          if(!same(current,value))features.set(key,value);
        }
        features.set('89',desired.get('1'));
        style.set('6',features);next.set('1',run.get('1'));return next;
      })}));
      // This experiment uses the reference's default left paragraph style.
      model.delete('5');
      copy.get('1').set('0',[M({0:i})]);
      function frameIds(value){if(value instanceof Map){if(value.get('99')?.name==='F')value.set('10',i);for(const x of value.values())frameIds(x);}else if(Array.isArray(value))value.forEach(frameIds);}
      frameIds(copy.get('1').get('2'));
      const layout=textSchema.layouts?.[i];
      if(layout){
        const R=values=>values.map(real);
        function recompose(v){
          if(v instanceof Map){
            const kind=v.get('99')?.name;
            if(kind==='S')v.get('15').set('0',generated.get('0').length);
            if(kind==='G'){
              const bbox=v.get('1').map(numeric),oldWidth=bbox[2],width=layout.positions.at(-2);
              bbox[2]=width;v.set('1',R(bbox));
              for(const key of ['8','9']){const bounds=v.get(key).map(numeric);bounds[2]=bounds[0]+(key==='8'?width:layout.positions.at(-1));v.set(key,R(bounds));}
              v.get('10').set('1',[generated.get('0').length]);
              const cache=v.get('21');cache.set('0',layout.glyphs);cache.set('1',R(layout.positions));
              v.get('22').set('0',[2]);v.get('22').set('1',R(layout.positions.slice(-2)));
            }
            for(const x of v.values())recompose(x);
          }else if(Array.isArray(v))v.forEach(recompose);
        }
        recompose(copy.get('1').get('2'));
      }
      return copy;
    });
    engine.set('1',completeStories);root=template;
  }
  if(!textSchema){
    const width=Math.max(...doc.artboards.map(b=>b.rect.x1)),height=Math.max(...doc.artboards.map(b=>b.rect.y1));
    textSchema=freshTextDocuments(fonts,frames,stories,[8191.5-(width/2+.5),8191.5-(height/2+.5)]);root=textSchema.root;
  }
  const t2=ascii85Lines(Buffer.from(writeTypedTxt2(root),'latin1'));
  const ruler=textSchema?.rulerOrigin || [0,0];
  let undoSection='';
  if(textSchema?.undoRoot){
    const revive=v=>Array.isArray(v)?v.map(revive):v&&typeof v==='object'&&!('raw'in v)&&!('name'in v)?new Map(Object.entries(v).map(([k,x])=>[k,revive(x)])):v;
    const undo=textSchema.undoRoot instanceof Map?textSchema.undoRoot:revive(textSchema.undoRoot);
    const encoded=ascii85Lines(Buffer.from(writeTypedTxt2(undo),'latin1'));
    undoSection=`/AI11UndoFreeTextDocument : /ASCII85Decode ,\r${encoded}\r;\r`;
  }
  const encodings=textSchema?.includeFontEncodings===false?'':fonts.map(name=>{
    if(!/^[A-Za-z0-9_-]+$/.test(name))throw Error('Invalid PostScript font name');
    return `%AI55J_Tsume: None\r%AI3_BeginEncoding: _${name} ${name}\r[/_${name}/${name} 0 ${name==='MicrosoftYaHei'?25:0} 0 TZ\r%AI3_EndEncoding TrueType\r`;
  }).join('');
  // A space prevents an ASCII85 line beginning '_' from becoming the PGF '%_' code prefix.
  const textSection=`${encodings}%AI11_BeginTextDocument\r/AI11TextDocument : /ASCII85Decode ,\r${t2}\r${ruler.map(N).join(' ')} /RulerOrigin ,\r;\r${undoSection}%AI11_EndTextDocument\r`;
  // Keep actual artboard positions instead of createDocument's automatic horizontal layout.
  let header=emptyStreamText({title:doc.title,artboards:doc.artboards.map(b=>({name:b.name,width:b.rect.x1-b.rect.x0,height:b.rect.y1-b.rect.y0}))});
  for(const b of doc.artboards) Object.values(b.rect).forEach(N);
  const bounds={x0:Math.min(...doc.artboards.map(b=>b.rect.x0)),y0:Math.min(...doc.artboards.map(b=>-b.rect.y1)),x1:Math.max(...doc.artboards.map(b=>b.rect.x1)),y1:Math.max(...doc.artboards.map(b=>-b.rect.y0))};
  header=header.replace(/%%BoundingBox:[^\r]*/,`%%BoundingBox: ${Math.floor(bounds.x0)} ${Math.floor(bounds.y0)} ${Math.ceil(bounds.x1)} ${Math.ceil(bounds.y1)}`)
    .replace(/%%HiResBoundingBox:[^\r]*/,`%%HiResBoundingBox: ${[bounds.x0,bounds.y0,bounds.x1,bounds.y1].map(N).join(' ')}`)
    .replace(/%AI5_NumLayers: 1/,`%AI5_NumLayers: ${doc.layers.length}`)
    .replace(/%%Creator:[^\r]*/,'%%Creator: VectorCraft AI Exporter experimental');
  // PGF art space is centered on the 16383pt legacy canvas; Txt2 anchors use that canvas.
  const cx=8191.5-ruler[0],cy=ruler[1]-8191.5;
  header=header.replace('%%EndComments',()=>`%%Canvassize: 16383\r%AI3_TemplateBox: ${[cx,cy,cx,cy].map(N).join(' ')}\r%%EndComments`);
  header=header.replace('%%EndComments',()=>`%AI3_TileBox: ${[bounds.x0,bounds.y0,bounds.x1,bounds.y1].map(N).join(' ')}\r%%PageOrigin:0 ${N(bounds.y0)}\r%%EndComments`);
  let index=0;
  header=header.replace(/%_[-\d.]+ [-\d.]+ \/RealPointRelToROrigin\r%_ \(PositionPoint([12])\)/g,(_,which)=>{
    const b=doc.artboards[Math.floor(index++/2)].rect;
    return `%_${which==='1'?`${N(b.x0)} ${N(-b.y0)}`:`${N(b.x1)} ${N(-b.y1)}`} /RealPointRelToROrigin\r%_ (PositionPoint${which})`;
  });
  header=header.slice(0,header.indexOf('%AI5_BeginLayer'));
  let boardIndex=0;
  header=header.replace(/%_1 \/Real \(PAR\) ,/g,()=>{
    const b=doc.artboards[boardIndex++].rect;
    return `%_${Math.floor(ruler[0]+b.x0)} ${Math.floor(ruler[1]+b.y0)} /RealPoint\r%_ (RulerOrigin) ,\r%_(00000000-0000-4000-b000-${String(boardIndex).padStart(12,'0')}) /String (ArtboardUUID) ,\r%_1 /Real (PAR) ,`;
  });
  // Encoded bytes can contain $&, $' and $`: a replacement string would interpolate them.
  header=header.replace('%%EndSetup',()=>textSection+'%%EndSetup');
  if(arrowStyles.length)header=header.replace('%%BeginSetup',()=>`%%BeginSetup\r%AI5_Begin_NonPrinting\r%AI9_BeginArtStyles\r${arrowStyles.join('')}%AI9_EndArtStyles\r%AI5_End_NonPrinting--\r${arrowSymbols(arrowKinds)}`);
  return {bytes:Buffer.concat([Buffer.from(header,'latin1'),...body,Buffer.from('%%PageTrailer\r%%Trailer\r%%EOF\r')]),counts};
}

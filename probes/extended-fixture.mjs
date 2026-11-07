// Extends the accepted scene; every added object is synthetic.
import {PNG} from 'pngjs';
import {advancedFixture} from './advanced-fixture.mjs';
export function extendedFixture(){
 const d=advancedFixture(),a=d.document.layers[0].kind.children;d.document.artboards[0].rect.y1=1500;let id=1000;
 const solid=(r,g,b)=>({type:'solid',color:{model:'rgb',r,g,b}}),blue=solid(.1,.3,.8),red=solid(.9,.1,.1),white=solid(1,1,1);
 const rectPath=(x,y,w,h)=>({subpaths:[{closed:true,anchors:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>({p}))}]});
 const rect=(name,x,y,w,h,paint=blue)=>({id:id++,name,appearance:{items:[{kind:'fill',paint}]},kind:{type:'path',path:rectPath(x,y,w,h)}});
 const text=(name,x,y,content)=>{const t=structuredClone(a.find(n=>n.name==='area-text'));t.id=id++;t.name=name;t.kind.kind={kind:'point'};t.kind.xf=[1,0,0,1,x,y];t.kind.runs[0].text=content;return t;};
 let t=text('columns-rows',30,1000,'A long editable story. '.repeat(18));t.kind.kind={kind:'area',frame:rectPath(0,0,260,170)};t.kind.area={rows:2,columns:2,gutter:10,rowGutter:12,firstBaseline:'capHeight',firstBaselineMin:8,verticalAlign:'top',inset:12,flow:'rows'};a.push(t);
 t=text('vertical-type',340,1030,'Vertical');t.kind.vertical=true;a.push(t);
 t=text('character-rotation',450,1030,'Rotate');t.kind.runs[0].style.rotation=17;a.push(t);
 t=text('partial-path',600,1040,'Partial curve');t.kind.kind={kind:'onpath',start:.25,end:.8,path:{subpaths:[{closed:false,anchors:[{p:[0,0],out:[80,-70]},{p:[240,0],in:[180,70]}]}]}};a.push(t);
 t=text('closed-path',600,1120,'Round the closed path');t.kind.kind={kind:'onpath',start:.7,end:.2,path:rectPath(0,0,220,70)};a.push(t);
 const gradient={type:'gradient',gradient:{kind:'Radial',stops:[{offset:0,color:red.color},{offset:1,color:blue.color}]},angle:0};
 const curve=rect('curve-gradient',30,1210,180,90,gradient);curve.kind.path={subpaths:[{closed:true,anchors:[{p:[120,1210],out:[169.7056,1210],in:[70.2944,1210]},{p:[210,1255],in:[210,1230.1472],out:[210,1279.8528]},{p:[120,1300],in:[169.7056,1300],out:[70.2944,1300]},{p:[30,1255],in:[30,1279.8528],out:[30,1230.1472]}]}]};a.push(curve);
 const ellipse=rect('ellipse-focal-gradient',240,1210,160,90,structuredClone(gradient));ellipse.appearance.items[0].paint.geom={start:{x:320,y:1255},end:{x:385,y:1275},aspect:.45,focal:{x:330,y:1250}};a.push(ellipse);
 const nested=rect('nested-mask',440,1210,80,80);nested.mask={clip:true,art:rect('outer-mask',440,1210,80,80,solid(.5,.5,.5))};nested.mask.art.mask={clip:true,art:rect('inner-mask',440,1210,80,80,solid(.5,.5,.5))};a.push(nested);
 const masked=rect('text-mask',560,1210,210,80);const letters=text('mask-letters',570,1270,'MASK');letters.kind.runs[0].style.size=50;letters.kind.runs[0].style.fill=white;masked.mask={clip:true,art:letters};a.push(masked);
 const clip=rect('compound-clip-path',30,1350,190,90);clip.kind.rule='EvenOdd';clip.kind.path.subpaths.push(...rectPath(90,1375,60,40).subpaths);clip.kind={type:'compound',rule:'EvenOdd',children:clip.kind.path.subpaths.map(sub=>({id:id++,kind:{type:'path',path:{subpaths:[sub]}}}))};a.push({id:id++,name:'compound-clip',kind:{type:'group',clip:true,children:[clip,rect('compound-clipped-art',10,1330,240,140,red)]}});
 const multi=rect('stacked-alignment',300,1350,90,70);multi.appearance.items.push({kind:'stroke',paint:red,width:12,align:'Inside'},{kind:'stroke',paint:solid(.9,.8,0),width:4,align:'Outside'});a.push(multi);
 const arrow=rect('filled-arrow',500,1350,180,50,red);arrow.kind.path={subpaths:[{closed:false,anchors:[{p:[500,1350]},{p:[590,1390]},{p:[680,1350]}]}]};arrow.appearance.items.push({kind:'stroke',paint:blue,width:4,end_arrow:'Circle',start_arrow:'Triangle',arrow_align:'Tip',arrow_scale:[100,100]});a.push(arrow);
 const maskPixels=Buffer.from([255,255,255,255,128,128,128,128,13,13,13,255,10,10,10,64]);d.images={maskPNG:{mime:'image/png',data:PNG.sync.write({width:2,height:2,data:maskPixels}).toString('base64')}};const rasterMask=rect('image-mask',790,1210,100,80);rasterMask.mask={clip:true,art:{id:id++,name:'mask-image',kind:{type:'image',key:'maskPNG',width:2,height:2,xf:[50,0,0,40,790,1210]}}};a.push(rasterMask);
 a.push(rect('gray-white',780,1350,40,40,{type:'solid',color:{model:'gray',k:0}}),rect('gray-half',830,1350,40,40,{type:'solid',color:{model:'gray',k:.5}}));const grayText=text('gray-text',780,1440,'Gray');grayText.kind.runs[0].style.fill={type:'solid',color:{model:'gray',k:.25}};a.push(grayText);
 const fade=rect('transparent-gradient',30,1450,180,35,{type:'gradient',gradient:{kind:'Linear',stops:[{offset:0,color:red.color,opacity:.2},{offset:1,color:blue.color,opacity:.8}]},angle:0});a.push(fade);
 d.document.layers.push({id:id++,name:'layer-transparency',opacity:.35,blend:'Multiply',kind:{type:'layer',color:{Preset:0},template:false,printable:true,children:[rect('layer-transparency-child',250,1450,80,35,red)]}});
 for(const [i,name] of ['linear-gradient-stroke','filled-gradient-stroke','dual-gradient-paint'].entries()){
  const x=400+i*150;const n=rect(name,x,1450,100,35,red);const ramp={type:'gradient',gradient:{kind:'Linear',stops:[{offset:0,color:red.color},{offset:1,color:blue.color}]},geom:{start:{x,y:1450},end:{x:x+100,y:1485}},angle:0};
  if(i===0)n.appearance.items=[];if(i===2)n.appearance.items[0].paint=structuredClone(ramp);n.appearance.items.push({kind:'stroke',paint:ramp,width:12,join:'Round',cap:'Round'});a.push(n);
 }
 d.document.next_id=id+1;return d;
}

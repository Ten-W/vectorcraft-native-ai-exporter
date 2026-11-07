import samples from '../test/image-samples.json' with {type:'json'};
import {fixture} from './fixture.mjs';
export function regressionFixture(){
  const d=fixture();d.document.artboards=[{id:1,name:'Regression',rect:{x0:0,y0:0,x1:900,y1:760}}];
  const paint={type:'solid',color:{model:'rgb',r:0.1,g:0.3,b:0.7}};
  const rect=(id,name,x,y,extra={})=>({id,name,...extra,appearance:{items:[{kind:'fill',paint}]},kind:{type:'path',path:{subpaths:[{closed:true,anchors:[{p:[x,y]},{p:[x+40,y]},{p:[x+40,y+40]},{p:[x,y+40]}]}]}}});
  const children=[rect(10,'locked-path',20,20,{locked:true}),rect(11,'after-locked',80,20),rect(12,'hidden-path',140,20,{visible:false}),rect(13,'after-hidden',200,20),{id:14,name:'locked-group',locked:true,kind:{type:'group',clip:false,children:[rect(15,'in-locked-group',260,20)]}},rect(16,'after-locked-group',320,20),{id:17,name:'hidden-group',visible:false,kind:{type:'group',children:[rect(18,'in-hidden-group',380,20)]}},rect(19,'after-hidden-group',440,20)];
  for(const [i,cap] of ['Butt','Round','Square'].entries())children.push({id:30+i,name:'cap-'+cap,appearance:{items:[{kind:'stroke',paint,width:10,cap,join:'Miter'}]},kind:{type:'path',path:{subpaths:[{closed:false,anchors:[{p:[40,130+i*40]},{p:[180,130+i*40]}]}]}}});
  for(const [i,join] of ['Miter','Round','Bevel'].entries())children.push({id:40+i,name:'join-'+join,appearance:{items:[{kind:'stroke',paint,width:14,cap:'Butt',join,miter_limit:8}]},kind:{type:'path',path:{subpaths:[{closed:false,anchors:[{p:[250+i*150,210]},{p:[300+i*150,110]},{p:[350+i*150,210]}]}]}}});
  const dash={id:50,name:'dash-offset',appearance:{items:[{kind:'stroke',paint,width:6,cap:'Round',join:'Bevel',miter_limit:7,dash:{pattern:[12,4],offset:3}}]},kind:{type:'path',path:{subpaths:[{closed:false,anchors:[{p:[40,280]},{p:[220,280]}]}]}}};children.push(dash);
  const arrow=structuredClone(dash);arrow.id=51;arrow.name='dashed-arrow';arrow.kind.path.subpaths[0].anchors=[{p:[300,280]},{p:[520,280]}];Object.assign(arrow.appearance.items[0],{end_arrow:'Triangle',arrow_align:'Tip',arrow_scale:[100,100]});children.push(arrow);
  for(const [i,align] of ['Inside','Outside'].entries()){
    const node=rect(60+i,'aligned-'+align,40+i*180,340);node.appearance.items.push({kind:'stroke',paint:{type:'solid',color:{model:'rgb',r:0.8,g:0.1,b:0.1}},width:8,cap:'Square',join:'Bevel',miter_limit:6,align,dash:{pattern:[8,4],offset:2}});children.push(node);
  }
  d.images={};for(const [i,[key,asset]] of Object.entries(samples).entries()){d.images[key]={mime:asset.mime,data:asset.data};children.push({id:70+i,name:'image-'+key,kind:{type:'image',key,width:2,height:2,xf:[30,0,0,30,480+i*100,340]}});}
  const text=structuredClone(d.document.layers[1].kind.children[0]);text.id=80;text.name='english-text';text.kind.xf=[1,0,0,1,40,500];children.push(text);
  const chinese=structuredClone(d.document.layers[0].kind.children[0].kind.children[0].kind.children[0]);chinese.id=81;chinese.name='chinese-text';chinese.kind.xf=[1,0,0,1,40,550];children.push(chinese);
  d.document.layers=[{id:1,name:'Regression layer',kind:{type:'layer',color:{Preset:0},template:false,printable:true,children}}];d.document.next_id=100;
  return d;
}

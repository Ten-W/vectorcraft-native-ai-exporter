import {fixture} from './fixture.mjs';
export const arrowKinds=['Triangle','Circle','Square','Diamond','Bar','TriangleOpen','CircleOpen','SquareOpen','DiamondOpen'];
export function advancedFixture(){
 const d=fixture();d.document.title='Native advanced regression';d.document.artboards=[{id:1,name:'Advanced',rect:{x0:0,y0:0,x1:1000,y1:980}}];d.images={};let id=100;
 const solid=(r,g,b)=>({type:'solid',color:{model:'rgb',r,g,b}}), blue=solid(.1,.3,.8),red=solid(.9,.1,.1);
 const frame=(x,y,w,h)=>({subpaths:[{closed:true,anchors:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>({p}))}]});
 const rect=(name,x,y,w=90,h=70,paint=blue)=>({id:id++,name,appearance:{items:[{kind:'fill',paint}]},kind:{type:'path',path:frame(x,y,w,h)}});
 const text=structuredClone(d.document.layers[1].kind.children[0]);
 const type=(name,value,x,y)=>{const t=structuredClone(text);t.id=id++;t.name=name;t.kind.xf=[1,0,0,1,x,y];t.kind.runs[0].text=value;t.kind.runs[0].style.size=20;return t;};
 const deco=type('decorated-text','Decorated text',30,40);Object.assign(deco.kind.runs[0].style,{underline:true,strikethrough:true,all_caps:true});
 const area=type('area-text','Editable area text wraps over several lines.',30,80);area.kind.kind={kind:'area',frame:frame(0,0,200,100)};
 const path=type('path-text','Editable along a curve',300,100);path.kind.kind={kind:'onpath',start:0,path:{subpaths:[{closed:false,anchors:[{p:[0,0],out:[80,-50]},{p:[230,0],in:[160,50]}]}]}};
 const a=[deco,area,path];
 const gradient=kind=>({type:'gradient',gradient:{kind,stops:[{offset:0,color:red.color},{offset:1,color:blue.color}]},angle:0});
 a.push(rect('linear-gradient',30,230,160,80,gradient('Linear')),rect('radial-gradient',230,230,100,100,gradient('Radial')));
 const multi=rect('multi-appearance',380,230);multi.appearance.items.push({kind:'fill',paint:red,opacity:.4},{kind:'stroke',paint:blue,width:8},{kind:'stroke',paint:red,width:2});a.push(multi);
 const transparent=rect('transparent-path',530,230);transparent.opacity=.35;transparent.blend='Multiply';a.push(transparent,rect('after-transparency',650,230));
 const group={id:id++,name:'transparent-group',opacity:.5,blend:'Screen',kind:{type:'group',children:[rect('group-child',790,230)]}};a.push(group);
 a.push({id:id++,name:'clipping-group',kind:{type:'group',clip:true,children:[rect('clip-path',30,380),rect('clipped-art',0,350,170,140,red)]}});
 const compound=rect('compound-hole',230,380);compound.kind={type:'compound',rule:'EvenOdd',children:[rect('outer',230,380),rect('hole',250,400,50,30)]};a.push(compound);
 const masked=rect('opacity-mask',390,380);masked.mask={clip:true,invert:false,art:rect('mask-art',390,380,90,70,solid(.5,.5,.5))};a.push(masked);
 const inverted=rect('inverted-mask',530,380);inverted.mask={clip:true,invert:true,art:rect('inverse-art',530,380,90,70,solid(.25,.25,.25))};a.push(inverted);
 for(const [i,kind] of arrowKinds.entries()){const y=550+Math.floor(i/3)*130,x=30+i%3*320;a.push({id:id++,name:'arrow-'+kind,appearance:{items:[{kind:'stroke',paint:blue,width:4,start_arrow:kind,end_arrow:kind,arrow_align:'Tip',arrow_scale:[80,120]}]},kind:{type:'path',path:{subpaths:[{closed:false,anchors:[{p:[x,y]},{p:[x+230,y]}]}]}}});}
 for(const [i,blend] of ['Normal','Multiply','Screen','Overlay','SoftLight','HardLight','ColorDodge','ColorBurn','Darken','Lighten','Difference','Exclusion','Hue','Saturation','Color','Luminosity'].entries()){const n=rect('blend-'+blend,15+i*61,920,40,30);n.blend=blend;a.push(n);}
 d.document.layers=[{id:1,name:'Advanced',kind:{type:'layer',color:{Preset:0},template:false,printable:true,children:a}}];d.document.next_id=id+1;return d;
}

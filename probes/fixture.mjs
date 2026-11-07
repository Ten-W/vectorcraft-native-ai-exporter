// Synthetic artwork only. No user document data is included.
import { PNG } from 'pngjs';
export function fixture() {
  const text={id:4,name:'中文标题',kind:{type:'text',kind:{kind:'point'},xf:[1,0,0,1,30,60],
    runs:[{text:'中文尺寸',style:{font_family:'Microsoft YaHei',font_style:'Regular',size:24,tracking:0,baseline_shift:0,h_scale:100,v_scale:100,rotation:0,stroke:{type:'none'},stroke_width:0,underline:false,strikethrough:false,all_caps:false,fill:{type:'solid',color:{model:'rgb',r:0,g:0,b:0}}}}],para:{justify:'Left',left_indent:0,right_indent:0,first_line_indent:0,space_before:0,space_after:0,hyphenate:false}}};
  const path={id:5,appearance:{items:[{kind:'stroke',paint:{type:'solid',color:{model:'rgb',r:0.2,g:0.4,b:0.8}},width:3}]},kind:{type:'path',path:{subpaths:[{anchors:[{p:[10,110],out:[40,80]},{p:[130,110],in:[100,150]}],closed:false}]}}};
  const image={id:6,kind:{type:'image',key:'sample',width:2,height:2,xf:[25,0,0,25,220,30]}};
  const data=Buffer.from([255,0,0,255,0,255,0,128,0,0,255,255,255,255,0,64]);
  const png=PNG.sync.write({width:2,height:2,data});
  const english=structuredClone(text);english.id=8;english.name='English title';english.kind.xf=[1,0,0,1,460,60];english.kind.runs[0].text='Editable text';english.kind.runs[0].style.font_family='Arial';
  return {format:'vectorcraft',version:4,images:{sample:{mime:'image/png',data:png.toString('base64')}},document:{version:1,title:'独立导出验证',units:'Points',rulers:'artboard',color_mode:'Rgb',swatches:[],swatch_groups:[],graphic_styles:[],symbols:[],guides:[],grid:{spacing:72,subdivisions:8},raster_effects_ppi:72,images:{},next_id:100,artboards:[
    {id:1,name:'画板一',rect:{x0:0,y0:0,x1:400,y1:240}}, {id:2,name:'画板二',rect:{x0:440,y0:20,x1:640,y1:180}}
  ],layers:[{id:1,name:'主图层',kind:{type:'layer',color:{Preset:0},template:false,printable:true,children:[{id:2,name:'外组',kind:{type:'group',clip:false,children:[{id:3,name:'内组',kind:{type:'group',clip:false,children:[text,path,image]}}]}}]}},
  {id:7,name:'第二图层',kind:{type:'layer',color:{Preset:0},template:false,printable:true,children:[english]}}]}};
}

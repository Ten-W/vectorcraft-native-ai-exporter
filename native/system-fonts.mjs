// Standalone preflight only. The sandboxed WASM has no access to font files.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import * as fontkit from 'fontkit';
import builtIn from './font-map.json' with {type:'json'};

export function inspectFonts(document,overrides={},extraFolders=[]){
  const needed=new Map();
  function visit(n){if(n.kind?.type==='text')for(const run of n.kind.runs||[]){
    const key=`${run.style.font_family.trim()}|${run.style.font_style.trim()}`;
    needed.set(key,(needed.get(key)||'')+run.text);
  }for(const c of n.kind?.children||[])visit(c);}
  document.document?.layers?.forEach(visit);
  if(!needed.size)return {map:{...overrides},warnings:[],fonts:[]};
  const folders=process.platform==='win32'?[path.join(process.env.WINDIR||'C:/Windows','Fonts'),path.join(process.env.LOCALAPPDATA||os.homedir(),'Microsoft/Windows/Fonts')]:process.platform==='darwin'?['/System/Library/Fonts','/Library/Fonts',path.join(os.homedir(),'Library/Fonts')]:['/usr/share/fonts','/usr/local/share/fonts',path.join(os.homedir(),'.local/share/fonts'),path.join(os.homedir(),'.fonts')];
  folders.push(...extraFolders);if(process.env.NATIVE_AI_FONTS_DIR)folders.push(process.env.NATIVE_AI_FONTS_DIR);
  if(process.platform==='win32')for(const hive of ['HKLM','HKCU'])try{
    const values=execFileSync('reg',['query',`${hive}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`],{encoding:'utf8',stdio:['ignore','pipe','ignore'],windowsHide:true,timeout:5000});
    for(const line of values.split(/\r?\n/)){const match=line.match(/\sREG_(?:EXPAND_)?SZ\s+(.+)$/);if(!match)continue;const file=match[1].trim().replace(/%([^%]+)%/g,(_,key)=>process.env[key]||`%${key}%`);folders.push(path.isAbsolute(file)?file:path.join(process.env.WINDIR||'C:/Windows','Fonts',file));}
  }catch{/* Font folders still work when registry enumeration is unavailable. */}
  const wantedPs=new Set([...needed.keys()].map(k=>overrides[k]||builtIn[k]).filter(Boolean));
  const names=new Map(),faces=new Map(),ambiguous=new Set(),seen=new Set();
  for(const folder of folders){
    let entries;try{entries=fs.statSync(folder).isFile()?[{isFile:()=>true,name:path.basename(folder),parentPath:path.dirname(folder)}]:fs.readdirSync(folder,{recursive:true,withFileTypes:true});}catch{continue;}
    for(const entry of entries){
      if(!entry.isFile()||!/[.](ttf|otf|ttc|otc)$/i.test(entry.name))continue;
      const file=path.join(entry.parentPath,entry.name);if(seen.has(file))continue;seen.add(file);
      try{
        if(fs.statSync(file).size>128*1024*1024)continue;
        const font=fontkit.create(fs.readFileSync(file));
        for(const face of font.fonts||[font]){
          const ps=face.postscriptName;if(!ps||!/^[-_A-Za-z0-9]+$/.test(ps))continue;
          const records=face.name.records,pairs=[[face.familyName,face.subfamilyName]];
          for(const locale of ['en','zh','zh-CN','zh-TW'])for(const [f,s] of [['fontFamily','fontSubfamily'],['preferredFamily','preferredSubfamily']])if(records[f]?.[locale]&&records[s]?.[locale])pairs.push([records[f][locale],records[s][locale]]);
          for(const [family,style] of pairs){const key=`${family}|${style}`;if(names.has(key)&&names.get(key)!==ps)ambiguous.add(key);names.set(key,ps);}
          if((wantedPs.has(ps)||pairs.some(([f,s])=>needed.has(`${f}|${s}`)))&&!faces.has(ps))faces.set(ps,face);
        }
      }catch{/* A damaged or unsupported font does not invalidate other installed fonts. */}
    }
  }
  const map={...overrides},warnings=[],fonts=[];
  for(const [key,text] of needed){
    const ps=overrides[key]||(!ambiguous.has(key)&&names.get(key))||builtIn[key];
    if(!ps)throw Error(`无法自动识别字体「${key}」。请安装该字体，或通过字体映射文件指定内部名称。`);
    map[key]=ps;fonts.push({familyStyle:key,postScriptName:ps,availableLocally:faces.has(ps)});
    const face=faces.get(ps);if(!face){warnings.push(`本机未找到字体「${key}」，导出会保留其名称；在 Illustrator 编辑前请安装同款字体。`);continue;}
    const missing=[...new Set([...text].filter(c=>!/[\s\p{Cf}\p{Cc}]/u.test(c)&&!face.hasGlyphForCodePoint(c.codePointAt(0))))];
    if(missing.length)throw Error(`字体「${key}」缺少字符：${missing.slice(0,16).join(' ')}。已停止导出，避免静默替换字形。`);
  }
  return {map,warnings,fonts};
}

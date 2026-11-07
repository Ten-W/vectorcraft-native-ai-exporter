// Standalone runner for the very same import-free plug-in. No Illustrator or VectorCraft process.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readVectorCraft} from './native/read-vectorcraft.mjs';
import {inspectFonts} from './native/system-fonts.mjs';

export async function exportNative(source,destination,fontMap={},wasmPath=fileURLToPath(new URL('./VectorCraft-Native-AI.wasm',import.meta.url))){
  source=path.resolve(source);destination=path.resolve(destination);
  if(path.extname(destination).toLowerCase()!=='.ai')throw Error('Destination must end in .ai');
  if(fs.existsSync(destination)||fs.existsSync(destination+'.report.json'))throw Error('Refusing to overwrite output or report');
  const module=await WebAssembly.compile(fs.readFileSync(wasmPath));
  if(WebAssembly.Module.imports(module).length)throw Error('Exporter must not import host functions');
  const {exports:e}=await WebAssembly.instantiate(module,{});
  if(e.vc_abi_version()!==1)throw Error('Unsupported exporter ABI');
  function read(packed){const p=Number(packed&0xffffffffn),size=Number(packed>>32n);if(size<0||size>128*1024*1024||p+size>e.memory.buffer.byteLength)throw Error('Invalid exporter output');return JSON.parse(Buffer.from(e.memory.buffer,p,size).toString('utf8'));}
  const manifest=read(e.vc_manifest());if(manifest.id!=='tenw.native-ai')throw Error('Unexpected exporter module');
  function alloc(value){const bytes=Buffer.from(JSON.stringify(value)),p=e.vc_alloc(bytes.length);if(!p)throw Error('Document exceeds exporter memory limit');new Uint8Array(e.memory.buffer,p,bytes.length).set(bytes);return[p,bytes.length];}
  // Saved files include their binary image tail; resolve it before calling the sandboxed module.
  const document=readVectorCraft(fs.readFileSync(source));
  const preflight=inspectFonts(document,fontMap,[path.join(path.dirname(source),'Fonts')]);
  const data=alloc(document),params=alloc({font_map:JSON.stringify(preflight.map)});
  const result=read(e.vc_run(...data,...params));if(result.error)throw Error(result.error);
  if(typeof result.dataBase64!=='string')throw Error('Exporter returned no file');
  const bytes=Buffer.from(result.dataBase64,'base64'),header=Buffer.from('%!PS-Adobe-3.0 ');if(!bytes.subarray(0,header.length).equals(header))throw Error('Exporter returned an invalid native AI header');
  fs.writeFileSync(destination,bytes,{flag:'wx'});
  const report={exporter:manifest.id,version:manifest.version,independent:true,illustratorRequired:false,vectorcraftRequired:false,bytes:bytes.length,fonts:preflight.fonts,warnings:[...preflight.warnings,...result.warnings||[]],individuallyVerifiedInIllustrator:false};
  fs.writeFileSync(destination+'.report.json',JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [source,dest,fontFile,wasm]=process.argv.slice(2);
  if(!source||!dest){console.error('Usage: node export-native.mjs source.vectorcraft new.ai [font-map.json] [VectorCraft-Native-AI.wasm]');process.exitCode=1;}
  else try{console.log(JSON.stringify(await exportNative(source,dest,fontFile?JSON.parse(fs.readFileSync(fontFile,'utf8')):{},wasm),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}

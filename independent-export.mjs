// Development prototype. Illustrator is never launched by this module.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import cp from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib';
import { readAiBytes } from 'ai-file';
import { nativeStream } from './native/stream.mjs';

import {readVectorCraft} from './native/read-vectorcraft.mjs';
export {readVectorCraft};

export function decodeImages(payload) {
  const assets={};
  for(const [key,image] of Object.entries(payload.images || {})) {
    if(image.mime!=='image/png') throw Error('Prototype requires PNG images; unsupported MIME: '+image.mime);
    const bytes=Buffer.from(image.data || '', 'base64');
    if(bytes.length<24 || bytes.toString('ascii',1,4)!=='PNG') throw Error('Invalid PNG');
    const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
    if(w===0||h===0||w*h>25000000) throw Error('Image exceeds 25 megapixels');
    assets[key]=PNG.sync.read(bytes,{checkCRC:true});
  }
  return assets;
}

export async function attachNative(previewPdf, nativeBytes) {
  nativeBytes=Buffer.from(nativeBytes);
  const pdf=await PDFDocument.load(previewPdf);
  if(!pdf.getPageCount()) throw Error('PDF preview has no pages');
  const ctx=pdf.context, bytes=Buffer.concat([Buffer.from('%AI12_CompressedData'),zlib.deflateSync(nativeBytes)]);
  const values={ContainerVersion:12,CreatorVersion:30,RoundtripVersion:24,RoundtripStreamType:1};
  const end=nativeBytes.indexOf(Buffer.from('%%EndComments'));
  values.AIMetaData=ctx.register(ctx.stream(nativeBytes.subarray(0,end<0?4096:end+13)));
  let blocks=0;
  for(let i=0;i<bytes.length;i+=65536) values['AIPrivateData'+(++blocks)]=ctx.register(ctx.stream(bytes.subarray(i,i+65536)));
  values.NumBlock=blocks;
  const now=PDFString.of('D:'+new Date().toISOString().replace(/\D/g,'').slice(0,14)+'Z');
  const privateRef=ctx.register(ctx.obj(values));
  const entry=ctx.register(ctx.obj({Private:privateRef,LastModified:now}));
  const page=pdf.getPage(0).node;
  let piece=page.lookupMaybe(PDFName.of('PieceInfo'),PDFDict);
  if(!piece) {piece=ctx.obj({});page.set(PDFName.of('PieceInfo'),piece);}
  piece.set(PDFName.of('Illustrator'),entry);
  page.set(PDFName.of('LastModified'),now);
  pdf.setCreator('VectorCraft AI Exporter (experimental)');
  const output=Buffer.from(await pdf.save({useObjectStreams:false,addDefaultPage:false}));
  const checked=readAiBytes(output);
  if(!Buffer.from(checked.container.stream).equals(nativeBytes))throw Error('Native stream changed during container writing');
  if(checked.document.warnings.length)throw Error('Native validation failed: '+checked.document.warnings.join('; '));
  if(nativeBytes.includes(Buffer.from('/AI11TextDocument :'))&&!checked.document.text)throw Error('Native text document failed to decode');
  return output;
}

export async function convert(source,destination,cli,fontMap={}) {
  source=path.resolve(source); destination=path.resolve(destination);
  if(path.extname(destination).toLowerCase()!=='.ai') throw Error('Destination must end in .ai');
  if(fs.existsSync(destination)) throw Error('Refusing to overwrite existing output');
  if(fs.existsSync(destination+'.report.json')) throw Error('Refusing to overwrite existing report');
  const payload=readVectorCraft(fs.readFileSync(source));
  const native=nativeStream(payload,decodeImages(payload),fontMap);
  if(!fs.existsSync(cli)) throw Error('VectorCraft CLI not found: '+cli);
  const work=fs.mkdtempSync(path.join(path.dirname(destination),'.vc-ai-independent-'));
  const preview=path.join(work,'preview.pdf');
  const render=cp.spawnSync(cli,['convert',source,preview],{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024});
  if(render.error || render.status!==0) throw Error('Preview export failed: '+(render.error || render.stderr));
  const result=JSON.parse(render.stdout.trim());
  if(result.warnings?.length || result.importWarnings?.length) throw Error('Preview reported losses: '+JSON.stringify(result));
  const bytes=await attachNative(fs.readFileSync(preview),native.bytes);
  const back=readAiBytes(bytes);
  if(back.document.text?.stories.length!==native.counts.text) throw Error('Native text verification failed');
  fs.writeFileSync(destination,bytes,{flag:'wx'});
  const report={experimental:true,illustratorVerified:false,illustratorRequiredForExport:false,
    counts:native.counts,text:back.document.text.stories.map(s=>s.text),nativeWarnings:back.document.warnings,
    limitations:['Only Triangle/Circle arrows on open unfilled paths with tip alignment','Only solid paints and PNG images','Point text only','Only the synthetic fixtures have passed Illustrator 30.0.0 verification; this output is not individually verified']};
  fs.writeFileSync(destination+'.report.json',JSON.stringify(report,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(work,'native.pgf'),native.bytes);
  return report;
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [flag,source,dest,cli='C:/Program Files/VectorCraft/vectorcraft-cli.exe',fontFile]=process.argv.slice(2);
  if(flag!=='--experimental'||!source||!dest) { console.error('Experimental: basic and native-arrow synthetic fixtures verified in Illustrator 30; WASM plug-in integration is under verification.\nUsage: node independent-export.mjs --experimental input.vectorcraft new.ai [vectorcraft-cli.exe] [font-map.json]'); process.exitCode=1; }
  else try { console.log(JSON.stringify(await convert(source,dest,cli,fontFile?JSON.parse(fs.readFileSync(fontFile,'utf8')):{}),null,2)); }
  catch(error) {console.error(error.message);process.exitCode=1;}
}

import zlib from 'node:zlib';
export function readVectorCraft(bytes) {
  if (bytes.length > 256*1024*1024) throw Error('Input exceeds 256 MiB');
  if (bytes[0]===31 && bytes[1]===139) bytes=zlib.gunzipSync(bytes,{maxOutputLength:512*1024*1024});
  const magic=Buffer.from('\n\0VCBLOBS\0'), end=bytes.indexOf(magic);
  const payload=JSON.parse(bytes.subarray(0,end<0?bytes.length:end).toString('utf8'));
  const tail=end<0?Buffer.alloc(0):bytes.subarray(end+magic.length);
  for(const image of Object.values(payload.images || {}))if(image.blob){
    const [offset,length]=image.blob;
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>tail.length)throw Error('Invalid image blob range');
    image.data=tail.subarray(offset,offset+length).toString('base64');
  }
  return payload;
}

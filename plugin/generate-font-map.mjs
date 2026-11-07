// Extract names only; never copy font programs into the repository or the WASM.
import fs from 'node:fs';
import * as fontkit from 'fontkit';
const files=process.argv.slice(2);
const coverageOnly=files[0]==='--coverage';if(coverageOnly)files.shift();
if(!files.length)throw Error('Pass the font files to catalog (TTF/OTF/TTC).');
const names=new Map(),ambiguous=new Set();
const coverage={};
for(const file of files){
  const font=fontkit.create(fs.readFileSync(file));
  for(const face of font.fonts||[font]){
    const ps=face.postscriptName;
    if(!ps||!/^[-_A-Za-z0-9]+$/.test(ps))continue;
    if(coverageOnly){const ranges=[];for(const cp of face.characterSet.sort((a,b)=>a-b)){const last=ranges.at(-1);if(last&&last[1]+1===cp)last[1]=cp;else ranges.push([cp,cp]);}coverage[ps]=ranges;continue;}
    const records=face.name.records;
    const pairs=[[face.familyName,face.subfamilyName]];
    for(const locale of ['en','zh','zh-CN','zh-TW']){
      for(const [family,style] of [['fontFamily','fontSubfamily'],['preferredFamily','preferredSubfamily']]){
        if(records[family]?.[locale]&&records[style]?.[locale])pairs.push([records[family][locale],records[style][locale]]);
      }
    }
    for(const [family,style] of pairs){
      const key=`${family}|${style}`;
      if(names.has(key)&&names.get(key)!==ps)ambiguous.add(key);
      names.set(key,ps);
    }
  }
}
for(const key of ambiguous)names.delete(key); // Never guess between different faces.
if(coverageOnly){fs.writeFileSync('native/font-coverage.json',JSON.stringify(coverage)+'\n');process.exit(0);}
fs.writeFileSync('native/font-map.json',JSON.stringify(Object.fromEntries([...names].sort(([a],[b])=>a<b?-1:a>b?1:0)),null,2)+'\n');
console.log(`Cataloged ${names.size} font names; omitted ${ambiguous.size} ambiguous names.`);

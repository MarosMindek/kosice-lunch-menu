import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsers } from './lib/normalize-sources.mjs';
import { validateSource, validISO } from './lib/menu-contract.mjs';

// Save independently validated originals even if another restaurant blocks the email.
export function publishSourceCache(input='output/autonomous/sources.json',root='results/source-cache') {
  if(!fs.existsSync(input))return;
  const collected=JSON.parse(fs.readFileSync(input,'utf8'));
  if(!validISO(collected.date))throw Error('Invalid cache date');
  const dir=path.join(root,collected.date),file=path.join(dir,'sources.json');
  const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{sources:{}};
  const sources={};
  for(const id of ['kozlovna','cool-bowling','tahiti','bluebell','stara-sypka']) {
    const raw=collected.sources?.[id] || previous.sources?.[id];
    if(!raw)continue;
    try {
      const parsed=id==='bluebell'?raw:parsers[id](raw,collected.date);
      validateSource(parsed.source,collected.date,id);
      if(parsed.reviewedComplete!==true || parsed.needsVisualReview===true)continue;
      sources[id]=raw;
    } catch { /* Never publish an unvalidated attempt as an accepted source. */ }
  }
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(file,JSON.stringify({date:collected.date,capturedAt:collected.capturedAt,sources},null,2));
  fs.writeFileSync(path.join(dir,'diagnostics.json'),JSON.stringify({date:collected.date,capturedAt:collected.capturedAt,validated:Object.keys(sources),errors:collected.errors||[]},null,2));
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))publishSourceCache();

import fs from 'node:fs';
import path from 'node:path';
import { parsers, fingerprint } from './normalize-sources.mjs';
import { validateSource, weekday } from './menu-contract.mjs';

export function weekDates(date) {
  const monday = +new Date(date) - ((weekday(date) + 6) % 7) * 86400000;
  return Array.from({length: 7}, (_, i) => new Date(monday + i * 86400000).toISOString().slice(0,10)).filter(d => d <= date).reverse();
}

export function cachedRestaurant(id, date, root='results') {
  const files = [process.env.LUNCH_SOURCE_CACHE, ...weekDates(date).flatMap(d => [
    path.join(root, 'source-cache', d, 'sources.json'),
    path.join(root, 'stable-menu', d, 'sources.json')
  ])].filter(Boolean);
  const accepted=[];
  for(const file of files) {
    if(!fs.existsSync(file))continue;
    try {
      const stored=JSON.parse(fs.readFileSync(file,'utf8'));
      const raw=stored.sources?.[id];
      if(!raw)continue;
      const parsed=id==='bluebell'?raw:parsers[id](raw,date);
      validateSource(parsed.source,date,id);
      if(parsed.reviewedComplete!==true || parsed.needsVisualReview===true)continue;
      accepted.push({raw,parsed,file});
    } catch { /* An expired document or wrong weekday is not reusable. */ }
  }
  if(new Set(accepted.map(x=>fingerprint(x.parsed))).size>1)throw Error(`${id}: conflicting validated cached sources`);
  return accepted[0] || null;
}

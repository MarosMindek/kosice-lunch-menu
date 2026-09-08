import { fold, normalized, serviceDates, weeklyDateRanges, moneyCents, weekday, validateSource } from './menu-contract.mjs';

const linesOf=raw=>raw.lines || String(raw.pdfText || raw.text || '').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const dayHeading=s=>/^(?:(?:\d{1,2}\.\s*\d{1,2}\.\s*\d{2,4})\s+)?(?:pondelok|utorok|streda|stvrtok|piatok|sobota|nedela)\b/.test(fold(s));
const priceRE=/(\d{1,3}[,.]\d{2})\s*(?:€|EUR)/gi;
const price=s=>{const p=[...s.matchAll(priceRE)];if(p.length!==1)throw Error('Expected one item price');return moneyCents(p[0][1])/100;};
const clean=s=>s.replace(/\s+/g,' ').trim();
const portionRE=/^(\d+(?:[,.]\d+)?(?:\s*\/\s*\d+(?:[,.]\d+)?)*\s*[gl])(?:\/|\s|$)/i;
const category=s=>/^(polievky|hlavne jedla|specialna ponuka)$/.test(fold(s));
function daily(raw,date) {
  const all=linesOf(raw), starts=all.map((s,i)=>dayHeading(s)&&serviceDates(s,date).includes(date)?i:-1).filter(i=>i>=0);
  if(starts.length!==1) throw Error('Missing or ambiguous current daily heading');
  const start=starts[0], next=all.findIndex((s,i)=>i>start&&(dayHeading(s)||/^upozornenie:/i.test(s)));
  return {all,section:all.slice(start,next<0?all.length:next)};
}
function source(raw,date,section,dateText,extra={}) {
  return {kind:raw.pdfText?'pdf':'html',url:raw.requestedPdfUrl || raw.requestedUrl,capturedAt:raw.capturedAt || raw.fetchedAt,text:linesOf(raw).join('\n'),sectionText:section.join('\n'),dateText,serviceDate:date,...extra};
}
function complete(id,src,soups,mains,desserts=[],notes=[]) {
  if(!soups.length||!mains.length)throw Error(`${id}: empty parsed menu`);
  return {id,source:src,soups,mains,desserts,notes,reviewedComplete:true,validation:'deterministic-parser-v1'};
}
export function parseKozlovna(raw,date) {
  const {section}=daily(raw,date), soups=[],mains=[];
  const prices=section.map((s,i)=>/^\d{1,3}[,.]\d{2}\s*€$/.test(s)?i:-1).filter(i=>i>=0);
  const anchors=prices.map(i=>{let a=i-1;while(a>0&&portionRE.test(section[a]))a--;if(a<=0||category(section[a])||dayHeading(section[a]))throw Error('Kozlovna: missing meal name');return a;});
  if(section.filter(s=>s.includes('€')).length!==prices.length)throw Error('Kozlovna: unparsed price layout');
  const mainHeading=section.findIndex(s=>fold(s)==='hlavne jedla');
  if(mainHeading<0)throw Error('Kozlovna: missing main heading');
  for(let j=0;j<prices.length;j++) {
    const start=anchors[j],end=anchors[j+1]??section.length,block=section.slice(start,end),details=block.slice(1).filter(s=>!s.includes('€')&&!category(s));
    const quantities=details.filter(s=>portionRE.test(s)), descriptions=details.filter(s=>!portionRE.test(s));
    if(quantities.length>1)throw Error('Kozlovna: ambiguous portion');
    const item={name:section[start],price:price(section[prices[j]]),sourceText:block.join('\n')};
    if(quantities.length)item.portion=quantities[0].match(portionRE)[1];
    if(descriptions.length)item.description=descriptions.join(' ');
    (start<mainHeading?soups:mains).push(item);
  }
  return complete('kozlovna',source(raw,date,section,section[0]),soups,mains);
}
export function parseCoolBowling(raw,date) {
  const {all,section}=daily(raw,date), soups=[],mains=[],desserts=[];
  const header=section[0], soupParts=[...header.matchAll(/(0[,.]\d+\s*l)\s+(.+?)(?=0[,.]\d+\s*l|$)/gi)];
  const headerPrices=[...header.matchAll(priceRE)];
  if(!soupParts.length)throw Error('Cool Bowling: no soup portions');
  for(const m of soupParts) {
    const own=[...m[2].matchAll(priceRE)],p=own.length===1?own[0]:headerPrices.length===1?headerPrices[0]:null;
    if(!p)throw Error('Cool Bowling: ambiguous soup price');
    const name=clean(m[2].replace(priceRE,'').replace(/\/[B\d,\s]+\//gi,''));
    soups.push({name,portion:m[1],price:moneyCents(p[1])/100,sourceText:header});
  }
  for(const row of section.slice(1)) {
    const m=row.match(/^(B\.M\.|\d+[AB]?(?:menu\s*-|DEZERT-))\s*(\d+g(?:\s*\/\s*\d+g)?)\s+(.+?)\s+\/[B,\d\s]+\/\s*(\d+[,.]\d{2})\s*€/i);
    if(!m)throw Error(`Cool Bowling: unparsed daily row: ${row.slice(0,100)}`);
    const item={name:clean(m[3]),portion:m[2],price:moneyCents(m[4])/100,sourceText:row};
    if(/^B\.M\./i.test(m[1]))item.category='biznis';
    (/DEZERT/i.test(m[1])?desserts:mains).push(item);
  }
  const notes=all.filter(s=>/polievka.*bez hlavneho jedla/i.test(fold(s)));
  return complete('cool-bowling',source(raw,date,section,header.split(':')[0]+':'),soups,mains,desserts,notes);
}
export function parseTahiti(raw,date) {
  const all=linesOf(raw), headings=all.filter(s=>/tyzdenne\s+menu/.test(fold(s))&&weeklyDateRanges(s).length);
  if(headings.length!==1)throw Error('Tahiti: missing weekly heading');
  const dateText=headings[0],start=all.indexOf(dateText),section=all.slice(start),soups=[],mains=[];
  if(section.some(dayHeading))throw Error('Tahiti: daily layout changed; shared weekly parsing refused');
  const starts=section.map((s,i)=>/^(polievka\s*\d+|menu\s*\d+|tip sef kuchara|tip sefkuchara)$/i.test(fold(s))?i:-1).filter(i=>i>=0);
  if(!starts.length)throw Error('Tahiti: no meal categories');
  let parsedPrices=0;
  for(let j=0;j<starts.length;j++) {
    const block=section.slice(starts[j],starts[j+1]??section.length), priceLines=block.filter(s=>/€|EUR/.test(s));
    if(priceLines.length!==1)throw Error('Tahiti: missing/ambiguous block price');
    const name=block[1].replace(/\s*\(Pôvod mäsa:[^)]+\).*$/,'').replace(/\s+[\d,]+$/,'').trim();
    const details=block.slice(2).filter(s=>!s.includes('€')),item={name,price:price(priceLines[0]),sourceText:block.join('\n')};
    if(details.length) {
      const detail=details.join(' '), q=detail.match(/(?:^|\s)(\d+(?:[,.]\d+)?(?:\/\d+)*\s*[gl])(?:\s|$)/);
      if(q)item.portion=q[1];
      const description=clean(q?detail.replace(q[1],''):detail);if(description)item.description=description;
    }
    (/^polievka/i.test(block[0])?soups:mains).push(item);parsedPrices++;
  }
  if([...section.join('\n').matchAll(priceRE)].length!==parsedPrices)throw Error('Tahiti: unparsed prices');
  return complete('tahiti',source(raw,date,section,dateText,{scope:'weekly-shared'}),soups,mains);
}
export function parseSypka(raw,date) {
  const lines=linesOf(raw), dates=lines.filter(s=>serviceDates(s,date).includes(date));
  if(!dates.length)throw Error('Sypka: PDF does not contain current date');
  const soups=[],mains=[],notes=[];
  const isLabel=s=>['starasypka','denne','menu','polievka','specialita','dennaponuka'].includes(normalized(s)) || serviceDates(s,date).length>0;
  const isFooter=s=>/^(1obilniny|6sojove|pribalenijedal)/.test(normalized(s));
  const priceIndexes=lines.map((s,i)=>/^\d{1,3}[,.]\d{2}\s*€$/.test(s)?i:-1).filter(i=>i>=0);
  let cursor=0;
  for(const end of priceIndexes) {
    const block=lines.slice(cursor,end+1);cursor=end+1;
    const useful=block.filter(s=>!isLabel(s)&&!isFooter(s));
    const text=useful.join('\n'), portions=[...text.matchAll(/\((\d+(?:[,.]\d+)?(?:\s*\/\s*\d+)*\s*[gl])\)\s*\([^)]*\)/gi)];
    if(portions.length!==1)throw Error('Sypka: ambiguous portion/meal block');
    const q=portions[0],name=clean(text.slice(0,q.index));
    if(name.length<5 || /€/.test(name))throw Error('Sypka: unreadable meal name');
    const item={name,portion:q[1],price:price(lines[end]),sourceText:lines.slice(end-block.length+1,end+1).join('\n')};
    (/l$/i.test(q[1])?soups:mains).push(item);
  }
  const otherPrices=lines.filter(s=>/€/.test(s)&&!/^\d{1,3}[,.]\d{2}\s*€$/.test(s));
  for(const line of otherPrices) { if(!isFooter(line))throw Error('Sypka: unparsed published price'); notes.push(line); }
  return complete('stara-sypka',source(raw,date,lines,dates[0]),soups,mains,[],notes);
}
export const parsers={kozlovna:parseKozlovna,'cool-bowling':parseCoolBowling,tahiti:parseTahiti,'stara-sypka':parseSypka};
export function fingerprint(menu) {
  return JSON.stringify([menu.source.validFrom,menu.source.validTo,...['soups','mains','desserts'].map(k=>(menu[k]||[]).map(i=>[normalized(i.name),normalized(i.description),normalized(i.portion),i.price]))]);
}

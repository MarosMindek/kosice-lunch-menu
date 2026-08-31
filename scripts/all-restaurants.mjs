import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'output/all-restaurants';
fs.mkdirSync(OUT, { recursive: true });

const TZ = 'Europe/Bratislava';
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
}).formatToParts(new Date()).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
const { year: yyyy, month: mm, day: dd } = parts;
const today = `${dd}.${mm}.${yyyy}`;
const base = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
const mondayOffset = (base.getUTCDay() + 6) % 7;
const monday = new Date(base); monday.setUTCDate(base.getUTCDate() - mondayOffset);
const friday = new Date(monday); friday.setUTCDate(monday.getUTCDate() + 4);
const fmt = (d, pad=true) => `${pad?String(d.getUTCDate()).padStart(2,'0'):d.getUTCDate()}.${pad?String(d.getUTCMonth()+1).padStart(2,'0'):d.getUTCMonth()+1}.${d.getUTCFullYear()}`;
const weekStart = fmt(monday), weekEnd = fmt(friday), weekStartLoose = fmt(monday,false), weekEndLoose = fmt(friday,false);
const needles = [today, `${Number(dd)}.${Number(mm)}.${yyyy}`, `${dd}. ${mm}. ${yyyy}`, `${dd}.${mm}.${String(yyyy).slice(-2)}`];
const clean = t => t.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const squash = t => (t||'').replace(/\s/g,'').toLowerCase();
const hasToday = t => needles.some(n => squash(t).includes(squash(n)));
const hasCurrentWeek = t => {
  const s=squash(t);
  return [weekStart,weekStartLoose].some(x=>s.includes(squash(x))) && [weekEnd,weekEndLoose].some(x=>s.includes(squash(x)));
};
const isBlueBellPub = t => {
  const s=(t||'').toLowerCase();
  return (s.includes('piváreň bluebell') || s.includes('pivaren bluebell') || s.includes('pivarenbluebell')) &&
         !s.includes('bluebell bistro') && !s.includes('+421 911 724 247');
};

const browser = await chromium.launch({headless:true});
const context = await browser.newContext({locale:'sk-SK', timezoneId:TZ, viewport:{width:1440,height:1600}, userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36'});
await context.route('**/*', async route => {
  const req=route.request();
  if(['font','media'].includes(req.resourceType())) return route.abort();
  await route.continue({headers:{...req.headers(),'cache-control':'no-cache, no-store, max-age=0',pragma:'no-cache'}}).catch(()=>{});
});

const results={today,weekStart,weekEnd,generatedAt:new Date().toISOString(),pages:{}};
async function visit(name,url,wait=6000,scroll=6){
  const p=await context.newPage();
  try{
    const sep=url.includes('?')?'&':'?';
    const resp=await p.goto(`${url}${sep}_cb=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:90000});
    await p.waitForTimeout(wait);
    for(let i=0;i<scroll;i++){await p.mouse.wheel(0,1200);await p.waitForTimeout(450);}
    const text=await p.locator('body').innerText().catch(()=> '');
    const data={name,requestedUrl:url,finalUrl:p.url(),status:resp?.status()??null,title:await p.title().catch(()=>''),today,weekStart,weekEnd,hasToday:hasToday(text),hasCurrentWeek:hasCurrentWeek(text),isBlueBellPub:isBlueBellPub(text+' '+p.url()),lines:clean(text)};
    results.pages[name]=data;
    fs.writeFileSync(`${OUT}/${name}.txt`,text);
    fs.writeFileSync(`${OUT}/${name}.json`,JSON.stringify(data,null,2));
    await p.screenshot({path:`${OUT}/${name}.png`,fullPage:true}).catch(()=>{});
  }catch(e){results.pages[name]={requestedUrl:url,error:String(e),today,weekStart,weekEnd};fs.writeFileSync(`${OUT}/${name}.error.txt`,String(e));}
  await p.close();
}

await visit('kozlovna','https://kozlovnakosice.sk/#obedove-menu',8000,8);
await visit('cool-bowling','https://www.coolbowling.sk/denne-menu');
await visit('tahiti-weekly','https://www.tahitirestaurant.sk/tyzdenne-menu',7000,10);
await visit('tahiti-andiamo','https://menu.andiamogroup.eu/chickin/denne-menu',7000,10);
await visit('bluebell-site','https://pivarenbluebell.sk/',7000,4);
await visit('bluebell-facebook','https://www.facebook.com/pivarenbluebell/',9000,10);
await visit('bluebell-facebook-posts','https://www.facebook.com/pivarenbluebell/posts/',9000,12);
await visit('bluebell-facebook-photos','https://www.facebook.com/pivarenbluebell/photos/',9000,12);
for (const [i,q] of [
  `site:facebook.com/pivarenbluebell/posts Piváreň BlueBell ${weekStartLoose} ${weekEndLoose} menu`,
  `site:facebook.com/pivarenbluebell Piváreň BlueBell ${weekStartLoose} ${weekEndLoose} týždňová obedová ponuka`,
  `Piváreň BlueBell Košice ${weekStartLoose} ${weekEndLoose} menu ceny`
].entries()) await visit(`bluebell-search-${i+1}`,`https://www.bing.com/search?q=${encodeURIComponent(q)}`,5500,3);
await visit('stara-sypka-home','https://www.starasypka.sk/sk/',7000,6);

// Hard safety guard: never let Bistro/cafe data qualify as BlueBell pub.
for(const [name,d] of Object.entries(results.pages)){
  if(name.startsWith('bluebell') && d.lines){
    d.blueBellAccepted = d.isBlueBellPub && (d.hasToday || d.hasCurrentWeek || name==='bluebell-site');
    if(/bistro|kaviareň|kaviaren|café|cafe/i.test(d.lines.join(' ')) && !/piváreň bluebell|pivaren bluebell/i.test(d.lines.join(' '))) d.blueBellAccepted=false;
    fs.writeFileSync(`${OUT}/${name}.json`,JSON.stringify(d,null,2));
  }
}
fs.writeFileSync(`${OUT}/summary.json`,JSON.stringify(results,null,2));
await browser.close();

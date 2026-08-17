import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT='output/all-restaurants';fs.mkdirSync(OUT,{recursive:true});
const today=new Intl.DateTimeFormat('sk-SK',{timeZone:'Europe/Bratislava',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date()).replaceAll(' ','');
const [dd,mm,yyyy]=today.split('.').filter(Boolean);const needles=[`${dd}.${mm}.${yyyy}`,`${Number(dd)}.${Number(mm)}.${yyyy}`,`${dd}. ${mm}. ${yyyy}`,`${dd}.${mm}.${String(yyyy).slice(-2)}`];
const clean=t=>t.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const hasToday=t=>needles.some(n=>t.replace(/\s/g,'').includes(n.replace(/\s/g,'')));
async function save(page,name,requestedUrl,status){const text=await page.locator('body').innerText().catch(()=>''),html=await page.content().catch(()=>''),lines=clean(text);const data={name,requestedUrl,finalUrl:page.url(),status,title:await page.title().catch(()=>''),today,hasToday:hasToday(text),lines};fs.writeFileSync(`${OUT}/${name}.txt`,text);fs.writeFileSync(`${OUT}/${name}.html`,html);fs.writeFileSync(`${OUT}/${name}.json`,JSON.stringify(data,null,2));await page.screenshot({path:`${OUT}/${name}.png`,fullPage:true}).catch(()=>{});return data;}
const browser=await chromium.launch({headless:true});const context=await browser.newContext({locale:'sk-SK',timezoneId:'Europe/Bratislava',viewport:{width:1440,height:1400}});await context.route('**/*',async route=>{const req=route.request();if(['font','media'].includes(req.resourceType()))return route.abort();await route.continue({headers:{...req.headers(),'cache-control':'no-cache, no-store, max-age=0',pragma:'no-cache'}}).catch(()=>{});});
const results={today,pages:{}};async function visit(name,url,wait=6000,scroll=6){const p=await context.newPage();try{const resp=await p.goto(url,{waitUntil:'domcontentloaded',timeout:90000});await p.waitForTimeout(wait);for(let i=0;i<scroll;i++){await p.mouse.wheel(0,1200);await p.waitForTimeout(500);}await p.evaluate(()=>scrollTo(0,0)).catch(()=>{});results.pages[name]=await save(p,name,url,resp?.status()??null);}catch(e){results.pages[name]={requestedUrl:url,error:String(e)};fs.writeFileSync(`${OUT}/${name}.error.txt`,String(e));}await p.close();}
await visit('cool-bowling','https://www.coolbowling.sk/denne-menu');
await visit('tahiti-weekly','https://www.tahitirestaurant.sk/tyzdenne-menu',7000,10);
await visit('tahiti-andiamo','https://menu.andiamogroup.eu/chickin/denne-menu',7000,10);
await visit('bluebell-site','https://pivarenbluebell.sk/');
await visit('bluebell-wolt','https://wolt.com/sk/svk/kosice/restaurant/bluebell-bistro',8000,12);
await visit('bluebell-facebook','https://www.facebook.com/pivarenbluebell/',8000,6);
await visit('bluebell-bing',`https://www.bing.com/search?q=${encodeURIComponent('BlueBell Košice 17.8.2026 21.8.2026 týždenné menu')}`,5000,2);
await visit('stara-sypka-home','https://www.starasypka.sk/sk/',7000,6);
for(const [n,d] of Object.entries(results.pages)){console.log(`\n===== ${n} =====`);console.log(JSON.stringify({url:d.finalUrl||d.requestedUrl,status:d.status,title:d.title,hasToday:d.hasToday,error:d.error},null,2));if(d.lines){const hits=d.lines.filter(x=>/(17\.?\s*8\.?\s*2026|17\.08\.26|€|EUR|PONDELOK|pondelok|menu|poliev|hlavn)/i.test(x));console.log(hits.slice(0,180).join('\n'));}}
fs.writeFileSync(`${OUT}/summary.json`,JSON.stringify(results,null,2));await browser.close();
// live multi-restaurant test

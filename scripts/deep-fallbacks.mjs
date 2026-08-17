import { chromium } from 'playwright';import fs from 'node:fs';
const OUT='output/deep-fallbacks';fs.mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({locale:'sk-SK',timezoneId:'Europe/Bratislava',viewport:{width:1440,height:1600}});
async function dump(p,n){const text=await p.locator('body').innerText().catch(()=>''),html=await p.content().catch(()=>''),imgs=await p.locator('img').evaluateAll(xs=>xs.map((x,i)=>({i,src:x.currentSrc||x.src,alt:x.alt,naturalWidth:x.naturalWidth,naturalHeight:x.naturalHeight})));fs.writeFileSync(`${OUT}/${n}.txt`,text);fs.writeFileSync(`${OUT}/${n}.html`,html);fs.writeFileSync(`${OUT}/${n}-images.json`,JSON.stringify(imgs,null,2));await p.screenshot({path:`${OUT}/${n}.png`,fullPage:true});return {text,imgs};}
// BlueBell Facebook current post
{const p=await ctx.newPage();await p.goto('https://www.facebook.com/pivarenbluebell/',{waitUntil:'domcontentloaded',timeout:90000});await p.waitForTimeout(7000);
for(const sel of ['div[aria-label="Zavrieť"]','div[aria-label="Close"]','button[aria-label="Zavrieť"]','button[aria-label="Close"]']){const x=p.locator(sel).last();if(await x.count())await x.click().catch(()=>{});}await p.keyboard.press('Escape').catch(()=>{});await p.waitForTimeout(1500);
for(const txt of ['Zobraziť viac','See more']){const xs=p.getByText(txt,{exact:false});for(let i=0;i<Math.min(await xs.count(),5);i++)await xs.nth(i).click().catch(()=>{});}await p.waitForTimeout(2000);const d=await dump(p,'bluebell-facebook-clean');
for(const im of d.imgs.filter(x=>x.naturalWidth>=450&&x.naturalHeight>=450)){await p.locator('img').nth(im.i).screenshot({path:`${OUT}/bluebell-img-${String(im.i).padStart(2,'0')}.png`}).catch(()=>{});}console.log('BLUEBELL TEXT\n'+d.text);console.log('BLUEBELL IMAGES\n'+JSON.stringify(d.imgs,null,2));await p.close();}
// BlueBell Wolt live menu
{const p=await ctx.newPage();await p.goto('https://wolt.com/sk/svk/kosice/restaurant/bluebell-bistro',{waitUntil:'domcontentloaded',timeout:90000});await p.waitForTimeout(7000);for(let i=0;i<10;i++){await p.mouse.wheel(0,1200);await p.waitForTimeout(400);}const d=await dump(p,'bluebell-wolt');console.log('WOLT\n'+d.text);await p.close();}
// Stara Sypka print route
{const p=await ctx.newPage();const r=await p.goto('https://www.starasypka.sk/print.php?file=denne-menu',{waitUntil:'domcontentloaded',timeout:90000});await p.waitForTimeout(7000);const d=await dump(p,'stara-sypka-print');console.log('SYPKA',r?.status(),p.url(),'\n'+d.text);await p.close();}
await browser.close();
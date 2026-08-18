import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT='output/bluebell-images';
fs.mkdirSync(OUT,{recursive:true});

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({
  locale:'sk-SK', timezoneId:'Europe/Bratislava', viewport:{width:1440,height:1600},
  userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
});

async function clean(page){
  for(const sel of ['div[aria-label="Zavrieť"]','div[aria-label="Close"]','button[aria-label="Zavrieť"]','button[aria-label="Close"]']){
    const xs=page.locator(sel); const n=await xs.count();
    if(n) await xs.nth(n-1).click().catch(()=>{});
  }
  await page.keyboard.press('Escape').catch(()=>{});
  for(const label of ['Použiť iba nevyhnutné','Allow only essential cookies','Odmietnuť voliteľné cookies']){
    const b=page.getByText(label,{exact:false}).first(); if(await b.count()) await b.click().catch(()=>{});
  }
  for(const txt of ['Zobraziť viac','See more']){
    const xs=page.getByText(txt,{exact:false});
    for(let i=0;i<Math.min(await xs.count(),10);i++) await xs.nth(i).click().catch(()=>{});
  }
  await page.waitForTimeout(1200);
}

async function dump(page,name){
  const text=await page.locator('body').innerText().catch(()=> '');
  fs.writeFileSync(`${OUT}/${name}.txt`,text);
  await page.screenshot({path:`${OUT}/${name}.png`,fullPage:true}).catch(()=>{});
  return text;
}

const meta={capturedAt:new Date().toISOString(),posts:[],photos:[]};

// Homepage: capture up to five public post/article cards.
{
  const p=await ctx.newPage();
  await p.goto('https://www.facebook.com/pivarenbluebell/',{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForTimeout(7000); await clean(p);
  for(let i=0;i<8;i++){await p.mouse.wheel(0,1100);await p.waitForTimeout(700);await clean(p);} 
  await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(800);
  await dump(p,'homepage');

  let articles=p.locator('div[role="article"]');
  let count=await articles.count();
  if(!count){ articles=p.locator('div[data-pagelet*="FeedUnit"]'); count=await articles.count(); }
  for(let i=0;i<Math.min(count,5);i++){
    const a=articles.nth(i); const txt=await a.innerText().catch(()=> '');
    const imgs=await a.locator('img').evaluateAll(xs=>xs.map(x=>({src:x.currentSrc||x.src,alt:x.alt,w:x.naturalWidth,h:x.naturalHeight})).filter(x=>x.src));
    await a.screenshot({path:`${OUT}/post-${String(i+1).padStart(2,'0')}.png`}).catch(()=>{});
    meta.posts.push({index:i+1,text:txt,images:imgs});
  }

  // Candidate photo links from homepage, in DOM order.
  const links=await p.locator('a').evaluateAll(as=>as.map(a=>({href:a.href||'',text:(a.innerText||'').trim()})).filter(x=>/facebook\.com\/.*\/(?:photos?|photo)\//i.test(x.href)||/[?&](?:fbid|set)=/i.test(x.href)));
  meta.homePhotoLinks=[...new Map(links.map(x=>[x.href,x])).values()].slice(0,30);
  await p.close();
}

// Photos page: collect visible thumbnails and links.
{
  const p=await ctx.newPage();
  await p.goto('https://www.facebook.com/pivarenbluebell/photos',{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForTimeout(7000); await clean(p);
  for(let i=0;i<10;i++){await p.mouse.wheel(0,1200);await p.waitForTimeout(650);await clean(p);} 
  await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(1000);
  await dump(p,'photos-page');
  const candidates=await p.locator('a').evaluateAll(as=>as.map((a,i)=>{
    const img=a.querySelector('img');
    return {i,href:a.href||'',text:(a.innerText||'').trim(),img:img?{src:img.currentSrc||img.src,alt:img.alt,w:img.naturalWidth,h:img.naturalHeight}:null};
  }).filter(x=>x.href && x.img && (x.img.w>=120||x.img.h>=120) && (/\/photo/i.test(x.href)||/[?&]fbid=/i.test(x.href))));
  const unique=[...new Map(candidates.map(x=>[x.href,x])).values()];
  meta.photoCandidates=unique.slice(0,20);
  for(let i=0;i<Math.min(unique.length,12);i++){
    const href=unique[i].href;
    const a=p.locator(`a[href="${href.replaceAll('"','\\"')}"]`).first();
    if(await a.count()) await a.screenshot({path:`${OUT}/thumb-${String(i+1).padStart(2,'0')}.png`}).catch(()=>{});
  }
  await p.close();
}

// Open up to 8 recent candidate photo links (homepage first, then photos page), save best large image.
const hrefs=[...(meta.homePhotoLinks||[]).map(x=>x.href),...(meta.photoCandidates||[]).map(x=>x.href)];
const uniq=[...new Set(hrefs)].slice(0,8);
for(let i=0;i<uniq.length;i++){
  const href=uniq[i]; const p=await ctx.newPage();
  try{
    await p.goto(href,{waitUntil:'domcontentloaded',timeout:90000}); await p.waitForTimeout(6500); await clean(p);
    const text=await p.locator('body').innerText().catch(()=> '');
    const imgs=await p.locator('img').evaluateAll(xs=>xs.map((x,j)=>({j,src:x.currentSrc||x.src,alt:x.alt,w:x.naturalWidth,h:x.naturalHeight,area:x.naturalWidth*x.naturalHeight})).filter(x=>x.src).sort((a,b)=>b.area-a.area));
    const best=imgs.find(x=>x.w>=500&&x.h>=500)||imgs[0];
    await p.screenshot({path:`${OUT}/photo-page-${String(i+1).padStart(2,'0')}.png`,fullPage:true}).catch(()=>{});
    if(best){
      const el=p.locator('img').nth(best.j); await el.screenshot({path:`${OUT}/photo-best-${String(i+1).padStart(2,'0')}.png`}).catch(()=>{});
    }
    fs.writeFileSync(`${OUT}/photo-${String(i+1).padStart(2,'0')}.txt`,text);
    meta.photos.push({index:i+1,href,finalUrl:p.url(),text:text.slice(0,8000),best,images:imgs.slice(0,20)});
  }catch(e){meta.photos.push({index:i+1,href,error:String(e)});}finally{await p.close();}
}

fs.writeFileSync(`${OUT}/metadata.json`,JSON.stringify(meta,null,2));
console.log(JSON.stringify({posts:meta.posts.map(x=>({index:x.index,text:x.text.slice(0,800),images:x.images.length})),photoCandidates:(meta.photoCandidates||[]).slice(0,10),photos:meta.photos.map(x=>({index:x.index,href:x.href,best:x.best,error:x.error}))},null,2));
await browser.close();

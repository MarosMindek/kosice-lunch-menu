import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT='output/bluebell-hires';
fs.rmSync(OUT,{recursive:true,force:true});
fs.mkdirSync(OUT,{recursive:true});

const TZ='Europe/Bratislava';
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({
  locale:'sk-SK',timezoneId:TZ,viewport:{width:1440,height:1800},
  userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
});

await ctx.route('**/*', async route => {
  const req=route.request();
  if(['font','media'].includes(req.resourceType())) return route.abort();
  await route.continue({headers:{...req.headers(),'cache-control':'no-cache, no-store, max-age=0',pragma:'no-cache'}}).catch(()=>{});
});

const sources=[
  ['page','https://www.facebook.com/pivarenbluebell/'],
  ['posts','https://www.facebook.com/pivarenbluebell/posts/'],
  ['photos','https://www.facebook.com/pivarenbluebell/photos/']
];

const all=[];
for(const [source,url] of sources){
  const p=await ctx.newPage();
  try{
    const bust=`${url}${url.includes('?')?'&':'?'}_cb=${Date.now()}`;
    await p.goto(bust,{waitUntil:'domcontentloaded',timeout:90000});
    await p.waitForTimeout(6000);
    for(const label of ['Použiť iba nevyhnutné','Allow only essential cookies','Odmietnuť voliteľné cookies','Len nevyhnutné']){
      const b=p.getByText(label,{exact:false}).first(); if(await b.count()) await b.click().catch(()=>{});
    }
    await p.keyboard.press('Escape').catch(()=>{});
    for(let i=0;i<16;i++){await p.mouse.wheel(0,1100);await p.waitForTimeout(450);}
    await p.screenshot({path:`${OUT}/${source}-page.png`,fullPage:true}).catch(()=>{});

    const candidates=await p.locator('a').evaluateAll((as,source)=>as.map((a,i)=>{
      const img=a.querySelector('img');
      if(!img) return null;
      const href=a.href||''; const src=img.currentSrc||img.src||'';
      if(!src||!href) return null;
      if(!(/\/photo/i.test(href)||/[?&]fbid=/i.test(href)||/\/posts\//i.test(href))) return null;
      return {source,i,href,src,alt:img.alt||'',w:img.naturalWidth,h:img.naturalHeight};
    }).filter(x=>x&&x.src&&x.href&&(x.w>=120||x.h>=120)),source);
    all.push(...candidates);
  }catch(e){
    fs.writeFileSync(`${OUT}/${source}.error.txt`,String(e));
  }
  await p.close();
}

const keyOf=x=>{
  try{const u=new URL(x.href); return u.searchParams.get('fbid')||x.href;}catch{return x.href;}
};
const unique=[...new Map(all.map(x=>[keyOf(x),x])).values()];
const meta=[];
for(let i=0;i<unique.length;i++){
  const c=unique[i];
  const tries=[
    c.src.replace(/ctp=s\d+x\d+/,'ctp=s2048x2048'),
    c.src.replace(/ctp=s\d+x\d+/,'ctp=s1440x1440'),
    c.src.replace(/ctp=s\d+x\d+/,'ctp=s1080x1080'),
    c.src
  ];
  let saved=null;
  for(const u of [...new Set(tries)]){
    try{
      const r=await ctx.request.get(u,{timeout:60000,headers:{referer:'https://www.facebook.com/pivarenbluebell/'}});
      if(!r.ok()) continue;
      const buf=await r.body();
      if(buf.length<5000) continue;
      const ct=r.headers()['content-type']||'';
      const ext=ct.includes('png')?'png':ct.includes('webp')?'webp':'jpg';
      const file=`gallery-${String(i+1).padStart(2,'0')}.${ext}`;
      fs.writeFileSync(`${OUT}/${file}`,buf);
      saved={file,bytes:buf.length,url:u,contentType:ct};
      break;
    }catch{}
  }
  meta.push({...c,fbid:keyOf(c),saved});
}

fs.writeFileSync(`${OUT}/metadata.json`,JSON.stringify({capturedAt:new Date().toISOString(),sourceCount:sources.length,candidates:meta},null,2));
console.log(JSON.stringify(meta.map((x,i)=>({i:i+1,source:x.source,href:x.href,fbid:x.fbid,alt:x.alt,w:x.w,h:x.h,saved:x.saved&&{file:x.saved.file,bytes:x.saved.bytes}})),null,2));
await browser.close();

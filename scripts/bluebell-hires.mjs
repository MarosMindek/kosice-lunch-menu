import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT='output/bluebell-hires';
fs.mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({
  locale:'sk-SK',timezoneId:'Europe/Bratislava',viewport:{width:1440,height:1600},
  userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
});
const p=await ctx.newPage();
await p.goto('https://www.facebook.com/pivarenbluebell/',{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForTimeout(7000);
for(const label of ['Použiť iba nevyhnutné','Allow only essential cookies','Odmietnuť voliteľné cookies']){
  const b=p.getByText(label,{exact:false}).first(); if(await b.count()) await b.click().catch(()=>{});
}
await p.keyboard.press('Escape').catch(()=>{});
for(let i=0;i<8;i++){await p.mouse.wheel(0,1000);await p.waitForTimeout(500);}
await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(1000);

const candidates=await p.locator('a').evaluateAll(as=>as.map((a,i)=>{
  const img=a.querySelector('img');
  return img?{i,href:a.href||'',src:img.currentSrc||img.src||'',alt:img.alt||'',w:img.naturalWidth,h:img.naturalHeight}:null;
}).filter(x=>x&&x.src&&x.href&&(/\/photo/i.test(x.href)||/[?&]fbid=/i.test(x.href))&&(x.w>=120||x.h>=120)));
const unique=[...new Map(candidates.map(x=>[x.href,x])).values()].slice(0,15);
const meta=[];
for(let i=0;i<unique.length;i++){
  const c=unique[i];
  const tries=[
    c.src.replace(/ctp=s\d+x\d+/,'ctp=s1080x1080'),
    c.src.replace(/ctp=s\d+x\d+/,'ctp=s720x720'),
    c.src
  ];
  let saved=null;
  for(const u of [...new Set(tries)]){
    try{
      const r=await ctx.request.get(u,{timeout:60000,headers:{referer:'https://www.facebook.com/'}});
      if(!r.ok()) continue;
      const buf=await r.body();
      if(buf.length<2000) continue;
      const ct=r.headers()['content-type']||'';
      const ext=ct.includes('png')?'png':ct.includes('webp')?'webp':'jpg';
      const file=`gallery-${String(i+1).padStart(2,'0')}.${ext}`;
      fs.writeFileSync(`${OUT}/${file}`,buf);
      saved={file,bytes:buf.length,url:u,contentType:ct};
      break;
    }catch{}
  }
  meta.push({...c,saved});
}
fs.writeFileSync(`${OUT}/metadata.json`,JSON.stringify({capturedAt:new Date().toISOString(),candidates:meta},null,2));
console.log(JSON.stringify(meta.map((x,i)=>({i:i+1,href:x.href,alt:x.alt,w:x.w,h:x.h,saved:x.saved&&{file:x.saved.file,bytes:x.saved.bytes}})),null,2));
await p.close(); await browser.close();

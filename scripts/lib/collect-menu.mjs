import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parsers, fingerprint } from './normalize-sources.mjs';
import { collectBluebell } from './bluebell-auto.mjs';
import { validateSource, validateMenu, weekday } from './menu-contract.mjs';
const execute=promisify(execFile);
const URLs={kozlovna:['https://kozlovnakosice.sk/#obedove-menu'],'cool-bowling':['https://www.coolbowling.sk/denne-menu'],tahiti:['https://www.tahitirestaurant.sk/tyzdenne-menu','https://menu.andiamogroup.eu/chickin/denne-menu'],'stara-sypka':['https://www.starasypka.sk/sk/restauracia/obedove-menu','https://www.starasypka.sk/sk/']};

export async function collectMenu(date,{out='output/autonomous',onStatus=()=>{}}={}) {
  const {chromium}=await import('playwright');
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({locale:'sk-SK',timezoneId:'Europe/Bratislava'}),sources={},errors=[];
  await ctx.route('**/*',route=>['font','media','image'].includes(route.request().resourceType())?route.abort():route.continue());
  async function capture(url,id) {
    const page=await ctx.newPage();
    try {
      const target=new URL(url);target.searchParams.set('_menu',String(Date.now()));
      const response=await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:35000});
      if(!response?.ok())throw Error('Source HTTP failure');
      await page.waitForTimeout(1800);
      const text=await page.locator('body').innerText();
      const raw={requestedUrl:url,capturedAt:new Date().toISOString(),lines:text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)};
      sources[id+'-latest-attempt']=raw;
      if(id==='stara-sypka') {
        const links=await page.locator('a').evaluateAll(as=>as.map(a=>a.href).filter(u=>/\.pdf(?:$|\?)/i.test(u)));
        for(const link of [...new Set(links)].slice(0,3)) {
          const pdfURL=new URL(link);if(!['www.starasypka.sk','starasypka.sk'].includes(pdfURL.hostname)||pdfURL.protocol!=='https:')continue;
          pdfURL.searchParams.set('_menu',String(Date.now()));
          const res=await ctx.request.get(pdfURL.href,{timeout:30000,headers:{'cache-control':'no-cache'}});
          if(!res.ok()||!/application\/pdf/.test(res.headers()['content-type']||''))continue;
          const pdf=path.join(out,'stara-sypka.pdf'),txt=path.join(out,'stara-sypka.txt');
          fs.writeFileSync(pdf,await res.body());await execute('pdftotext',['-raw',pdf,txt],{timeout:15000});
          const candidate={...raw,lines:undefined,pdfText:fs.readFileSync(txt,'utf8'),requestedPdfUrl:pdfURL.href};
          sources['stara-sypka-pdf-'+pdfURL.pathname.split('/').pop()]=candidate;
          try{const parsed=parsers[id](candidate,date);validateSource(parsed.source,date,id);return{raw:candidate,parsed};}catch(e){errors.push({id,reason:e.message});}
        }
        throw Error('No current Sypka PDF parsed');
      }
      const parsed=parsers[id](raw,date);validateSource(parsed.source,date,id);return{raw,parsed};
    }finally{await page.close();}
  }
  async function restaurant(id) {
    for(let attempt=0;attempt<2;attempt++) {
      const results=await Promise.allSettled(URLs[id].map(url=>capture(url,id))),ok=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
      results.filter(r=>r.status==='rejected').forEach(r=>errors.push({id,attempt,reason:r.reason.message}));
      if(ok.length) {
        if(new Set(ok.map(x=>fingerprint(x.parsed))).size!==1)throw Error(`${id}: conflicting official sources`);
        sources[id]=ok[0].raw;onStatus({id,status:'validated'});return ok[0].parsed;
      }
    }
    throw Error(`${id}: current complete menu unavailable`);
  }
  const ids=['kozlovna','cool-bowling','tahiti',...(weekday(date)===1?[]:['stara-sypka'])];
  try {
    const results=await Promise.allSettled([
      ...ids.map(restaurant),
      (async()=>{await execute(process.execPath,['scripts/bluebell-hires.mjs'],{timeout:420000,maxBuffer:1024*1024});const menu=collectBluebell('output/bluebell-hires',date);sources.bluebell=menu;onStatus({id:'bluebell',status:'validated'});return menu;})()
    ]);
    const failures=results.filter(r=>r.status==='rejected');
    if(failures.length)throw Error(failures.map(r=>r.reason.message).join('; '));
    const menu={date,restaurants:results.map(r=>r.value)};
    validateMenu(menu,{date});return menu;
  }finally {
    await browser.close();
    fs.writeFileSync(path.join(out,'sources.json'),JSON.stringify({date,capturedAt:new Date().toISOString(),sources,errors},null,2));
  }
}

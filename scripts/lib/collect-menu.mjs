import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parsers, fingerprint } from './normalize-sources.mjs';
import { collectBluebell, validatedBluebellBackup } from './bluebell-auto.mjs';
import { cachedRestaurant } from './source-cache.mjs';
import { validateSource, validateMenu, weekday, sha256 } from './menu-contract.mjs';
const execute=promisify(execFile);
const URLs={kozlovna:['https://kozlovnakosice.sk/#obedove-menu'],'cool-bowling':['https://www.coolbowling.sk/denne-menu'],tahiti:['https://www.tahitirestaurant.sk/tyzdenne-menu','https://menu.andiamogroup.eu/chickin/denne-menu'],'stara-sypka':['https://www.starasypka.sk/sk/','https://www.starasypka.sk/sk/restauracia/obedove-menu']};

export async function collectMenu(date,{out='output/autonomous',onStatus=()=>{}}={}) {
  const {chromium}=await import('playwright');
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({locale:'sk-SK',timezoneId:'Europe/Bratislava',serviceWorkers:'block',extraHTTPHeaders:{'cache-control':'no-cache, no-store, max-age=0',pragma:'no-cache'}}),sources={},errors=[];
  await ctx.route('**/*',route=>['font','media','image'].includes(route.request().resourceType())?route.abort():route.continue());
  async function capture(url,id) {
    const page=await ctx.newPage();
    try {
      const target=new URL(url);target.searchParams.set('_menu',String(Date.now()));
      const response=await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:35000});
      if(!response?.ok())throw Error('Source HTTP failure');
      await page.waitForTimeout(1800);
      // The restaurant's weekly page is a wrapper: follow its actual official iframe.
      if(id==='tahiti' && new URL(url).hostname.endsWith('tahitirestaurant.sk')) {
        const frames=await page.locator('iframe').evaluateAll(xs=>xs.map(x=>x.src));
        const menus=frames.filter(href=>{try{const u=new URL(href);return u.protocol==='https:'&&u.hostname==='menu.andiamogroup.eu';}catch{return false;}});
        if(menus.length!==1)throw Error('Tahiti: missing/ambiguous official menu iframe');
        return await capture(menus[0],id);
      }
      const text=await page.locator('body').innerText();
      const raw={requestedUrl:url,capturedAt:new Date().toISOString(),lines:text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)};
      sources[id+'-attempt-'+sha256(url).slice(0,12)]=raw;
      if(id==='stara-sypka') {
        const links=await page.locator('a').evaluateAll(as=>{
          const pdfs=as.filter(a=>/\.pdf(?:$|\?)/i.test(a.href));
          const daily=pdfs.filter(a=>/zobrazi|vytla/i.test(a.textContent||''));
          return(daily.length?daily:pdfs).map(a=>a.href);
        });
        for(const link of [...new Set(links)].slice(0,3)) {
          const pdfURL=new URL(link);if(!['www.starasypka.sk','starasypka.sk'].includes(pdfURL.hostname)||pdfURL.protocol!=='https:')continue;
          pdfURL.searchParams.set('_menu',String(Date.now()));
          const res=await ctx.request.get(pdfURL.href,{timeout:30000,headers:{'cache-control':'no-cache'}});
          if(!res.ok()||!/application\/pdf/.test(res.headers()['content-type']||''))continue;
          const stem='stara-sypka-'+sha256(url+'\n'+link).slice(0,16);
          const pdf=path.join(out,stem+'.pdf'),txt=path.join(out,stem+'.txt');
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
    if(['cool-bowling','tahiti'].includes(id)) {
      const cached=cachedRestaurant(id,date);
      if(cached){sources[id]=cached.raw;onStatus({id,status:'validated-weekly-cache'});return cached.parsed;}
    }
    for(let attempt=0;attempt<2;attempt++) {
      let results;
      if(id==='stara-sypka') {
        results=[];
        for(const url of URLs[id]) {try{results.push({status:'fulfilled',value:await capture(url,id)});break;}catch(reason){results.push({status:'rejected',reason});}}
      }else results=await Promise.allSettled(URLs[id].map(url=>capture(url,id)));
      const ok=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
      results.filter(r=>r.status==='rejected').forEach(r=>errors.push({id,attempt,reason:r.reason.message}));
      if(ok.length) {
        if(new Set(ok.map(x=>fingerprint(x.parsed))).size!==1)throw Error(`${id}: conflicting official sources`);
        sources[id]=ok[0].raw;onStatus({id,status:'validated'});return ok[0].parsed;
      }
    }
    try {
      const cached=cachedRestaurant(id,date);
      if(cached) {
        sources[id]=cached.raw;
        onStatus({id,status:'validated-source-cache'});
        return cached.parsed;
      }
    } catch(error) {
      errors.push({id,reason:`source cache rejected: ${error.message}`});
    }
    throw Error(`${id}: current complete menu unavailable`);
  }
  async function bluebell() {
    const errorFile='results/bluebell-hires/validation-error.json';
    const previousError=fs.existsSync(errorFile)?JSON.parse(fs.readFileSync(errorFile,'utf8')):{};
    const conflict=previousError.date===date&&/conflict/i.test(previousError.error||'');
    const primary=conflict?null:validatedBluebellBackup(date),stored=conflict?null:cachedRestaurant('bluebell',date)?.parsed;
    if(primary&&stored&&fingerprint(primary)!==fingerprint(stored))throw Error('Bluebell: conflicting validated caches');
    const cached=primary || stored;
    if(cached) {
      sources.bluebell=cached;onStatus({id:'bluebell',status:'validated-cache'});return cached;
    }
    try {
      await execute(process.execPath,['scripts/bluebell-hires.mjs'],{timeout:420000,maxBuffer:1024*1024});
      const menu=collectBluebell('output/bluebell-hires',date);sources.bluebell=menu;onStatus({id:'bluebell',status:'validated-live'});return menu;
    } catch(error) {
      errors.push({id:'bluebell',reason:error.message});
      const fallback=validatedBluebellBackup(date);
      if(fallback) {sources.bluebell=fallback;onStatus({id:'bluebell',status:'validated-cache-after-live-failure'});return fallback;}
      throw error;
    }
  }
  const ids=['kozlovna','cool-bowling','tahiti',...(weekday(date)===1?[]:['stara-sypka'])];
  try {
    const results=await Promise.allSettled([...ids.map(restaurant),bluebell()]);
    const failures=results.filter(r=>r.status==='rejected');
    if(failures.length)throw Error(failures.map(r=>r.reason.message).join('; '));
    const menu={date,restaurants:results.map(r=>r.value)};
    validateMenu(menu,{date});return menu;
  }finally {
    await browser.close();
    fs.writeFileSync(path.join(out,'sources.json'),JSON.stringify({date,capturedAt:new Date().toISOString(),sources,errors},null,2));
  }
}

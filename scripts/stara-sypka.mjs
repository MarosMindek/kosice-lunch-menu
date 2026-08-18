import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT='output/stara-sypka';
fs.mkdirSync(OUT,{recursive:true});
const now=new Date();
const today=new Intl.DateTimeFormat('sk-SK',{timeZone:'Europe/Bratislava',day:'2-digit',month:'2-digit',year:'numeric'}).format(now).replaceAll(' ','');
const cacheBust=Date.now();

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({locale:'sk-SK',timezoneId:'Europe/Bratislava',viewport:{width:1440,height:1400}});
const page=await ctx.newPage();

const pageUrl=`https://www.starasypka.sk/sk/?_live=${cacheBust}`;
const resp=await page.goto(pageUrl,{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForTimeout(4000);
const bodyText=await page.locator('body').innerText().catch(()=> '');
fs.writeFileSync(path.join(OUT,'page.txt'),bodyText);
fs.writeFileSync(path.join(OUT,'page.html'),await page.content());
await page.screenshot({path:path.join(OUT,'page.png'),fullPage:true});

const menuLinks=await page.locator('a').evaluateAll(as=>as.map(a=>({text:(a.innerText||a.textContent||'').trim(),href:a.href})).filter(x=>/ZOBRAZI|VYTLA|menu|ponuka/i.test(x.text)||/\.pdf(?:$|\?)/i.test(x.href)));
// Prefer the actual daily-menu PDF. The page also contains unrelated "zobraziť všetky fotky" links.
const chosen=
  menuLinks.find(x=>/\/media\/object\/.*\.pdf(?:$|\?)/i.test(x.href)) ||
  menuLinks.find(x=>/\.pdf(?:$|\?)/i.test(x.href) && /VYTLAČIŤ|VYTLACIT/i.test(x.text)) ||
  menuLinks.find(x=>/\.pdf(?:$|\?)/i.test(x.href) && /ZOBRAZIŤ|ZOBRAZIT/i.test(x.text)) ||
  menuLinks.find(x=>/\.pdf(?:$|\?)/i.test(x.href));
if(!chosen?.href) throw new Error(`Menu PDF link not found. Candidates: ${JSON.stringify(menuLinks)}`);

const pdfUrl=new URL(chosen.href);
pdfUrl.searchParams.set('_live',String(cacheBust));
const pdfResp=await ctx.request.get(pdfUrl.toString(),{headers:{'cache-control':'no-cache, no-store, max-age=0',pragma:'no-cache'},timeout:90000});
if(!pdfResp.ok()) throw new Error(`PDF HTTP ${pdfResp.status()} for ${pdfUrl}`);
const pdfBytes=await pdfResp.body();
const pdfPath=path.join(OUT,'menu.pdf');
fs.writeFileSync(pdfPath,pdfBytes);

let pdfText='';
try {
  execFileSync('pdftotext',['-layout',pdfPath,path.join(OUT,'menu.txt')],{stdio:'pipe'});
  pdfText=fs.readFileSync(path.join(OUT,'menu.txt'),'utf8');
} catch(e) {
  fs.writeFileSync(path.join(OUT,'pdftotext-error.txt'),String(e));
}

const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const nBody=normalize(bodyText), nPdf=normalize(pdfText);
const parts=today.split('.').filter(Boolean);
const d=String(Number(parts[0])), m=String(Number(parts[1])), y=parts[2];
const dateVariants=[today,`${d}.${m}.${y}`,`${d}. ${m}. ${y}`,`${d}.${m}.${y.slice(-2)}`].map(normalize);
const pageDateMatch=dateVariants.some(x=>nBody.includes(x));
const pdfDateMatch=dateVariants.some(x=>nPdf.includes(x));

const priceLines=pdfText.split(/\r?\n/).map(x=>x.trim()).filter(x=>/€|\b\d+[,.]\d{2}\b/.test(x));
const summary={
  fetchedAt:new Date().toISOString(),today,pageStatus:resp?.status()??null,finalPageUrl:page.url(),
  pageDateMatch,pdfDateMatch,chosenLink:chosen,requestedPdfUrl:pdfUrl.toString(),pdfStatus:pdfResp.status(),
  contentType:pdfResp.headers()['content-type']||null,contentLength:pdfBytes.length,
  menuLinks,priceLines,pdfText
};
fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));

if(!/application\/pdf/i.test(summary.contentType||'')) throw new Error(`Expected PDF, got ${summary.contentType}`);
if(!pdfText) throw new Error('PDF downloaded but pdftotext produced no text');
if(!pdfDateMatch) throw new Error(`Downloaded PDF is not for today (${today}). PDF text starts: ${pdfText.slice(0,500)}`);

await browser.close();

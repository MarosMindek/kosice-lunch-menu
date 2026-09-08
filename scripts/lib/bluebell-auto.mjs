import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseBluebell } from '../bluebell-select.mjs';
import { sha256, normalized, validateSource, dateRanges } from './menu-contract.mjs';

export function cleanOCRMenu(menu) {
  const m=structuredClone(menu);
  for(const soup of m.soups) soup.name=soup.name.replace(/\s+[\d,]+\s*$/,'').trim();
  return m;
}
export function imageMenuKey(m) {
  return JSON.stringify([m.source.validFrom,m.source.validTo,m.soups.map(i=>[normalized(i.name),i.price]),m.mains.map(i=>[i.category,normalized(i.name),i.price])]);
}
export function agreeOCR(passes,candidate,date) {
  const groups=new Map();
  for(const pass of passes) {
    if(pass.confidence<85 || !/^[a-f0-9]{64}$/.test(pass.inputSha256))continue;
    try {
      const menu=cleanOCRMenu(parseBluebell(pass.text,candidate,candidate.capturedAt,date));
      if(menu.soups.length!==3)continue;
      const key=imageMenuKey(menu),group=groups.get(key)||[];
      if(!group.some(p=>p.pass.inputSha256===pass.inputSha256&&p.pass.psm===pass.psm))group.push({menu,pass});
      groups.set(key,group);
    } catch { /* A non-menu image or unclear reading is not evidence. */ }
  }
  // Different complete readings are a conflict, even if one has more votes.
  if(groups.size!==1)return null;
  const group=[...groups.values()][0];if(group.length<2)return null;
  const menu=group[0].menu;
  menu.reviewedComplete=true;menu.needsVisualReview=false;
  menu.validation='tesseract-consensus-v1';
  menu.source.verification='tesseract-consensus-v1';
  menu.source.ocrEvidence=group.map(({pass})=>({psm:pass.psm,inputSha256:pass.inputSha256,textSha256:sha256(pass.text),confidence:pass.confidence}));
  return menu;
}
export function ocrConfidence(tsv) {
  const words=tsv.trim().split(/\r?\n/).slice(1).map(s=>s.split('\t')).filter(p=>p[0]==='5'&&p[11]?.trim());
  if(words.length<30)return 0;
  const scores=words.map(p=>Number(p[10])).filter(n=>n>=0);
  return scores.reduce((a,b)=>a+b,0)/scores.length;
}
export function collectBluebell(directory,date,backupDirectory='data/bluebell') {
  const meta=JSON.parse(fs.readFileSync(path.join(directory,'metadata.json'),'utf8')), accepted=[],observed=[],failures=[];
  const backups=fs.existsSync(backupDirectory)?fs.readdirSync(backupDirectory).filter(f=>f.endsWith('.json')).flatMap(f=>{
    try{const m=JSON.parse(fs.readFileSync(path.join(backupDirectory,f)));validateSource(m.source,date,'bluebell');return[m];}catch{return[];}
  }):[];
  const out=path.join(directory,'auto-ocr');fs.mkdirSync(out,{recursive:true});
  for(const c of meta.candidates||[]) {
    if(!c.saved)continue;
    const file=path.join(directory,path.basename(c.saved.file));
    if(sha256(fs.readFileSync(file))!==c.imageSha256)throw Error('Bluebell image provenance mismatch');
    const enhanced=path.join(out,path.parse(c.saved.file).name+'-enhanced.png');
    execFileSync('python3',['scripts/ocr-preprocess.py',file,enhanced],{timeout:15000,stdio:'pipe'});
    const passes=[];
    for(const [image,psm,label] of [[file,6,'original-6'],[file,11,'original-11'],[enhanced,6,'enhanced-6']]) {
      const base=path.join(out,path.parse(c.saved.file).name+'-'+label);
      try {
        execFileSync('tesseract',[image,base,'-l','slk+eng','--psm',String(psm),'txt','tsv'],{timeout:20000,stdio:'pipe'});
        const text=fs.readFileSync(base+'.txt','utf8'),confidence=ocrConfidence(fs.readFileSync(base+'.tsv','utf8'));
        passes.push({text,confidence,psm,inputSha256:sha256(fs.readFileSync(image))});
        try{observed.push(cleanOCRMenu(parseBluebell(text,c,c.capturedAt,date)));}catch{}
        if(label==='original-6') {
          const ranges=dateRanges(text),markers=[...normalized(text).matchAll(/biznismenu|tradicnemenu|veggiemenu|specialmenu/g)].length;
          if(markers<3 || (ranges.length===1&&(ranges[0].to<date||ranges[0].from>date)))break;
        }
      }catch{failures.push({file:c.saved.file,psm,reason:'ocr_failed'});}
    }
    const menu=agreeOCR(passes,c,date);if(menu)accepted.push(menu);
  }
  const keys=new Set(accepted.map(imageMenuKey));
  if(keys.size>1)throw Error('Bluebell: conflicting current images');
  if(accepted.length) {
    if(observed.some(m=>imageMenuKey(m)!==imageMenuKey(accepted[0])))throw Error('Bluebell: conflicting complete OCR readings');
    return accepted[0];
  }
  // The explicitly verified attachment is only an expiring fallback, never relabelled.
  if(backups.length===1) {
    if(observed.some(m=>imageMenuKey(m)!==imageMenuKey(backups[0])))throw Error('Bluebell: current image conflicts with verified backup');
    return backups[0];
  }
  throw Error('Bluebell: no current menu with agreeing OCR and sufficient confidence');
}

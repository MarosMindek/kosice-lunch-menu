import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parsers} from '../scripts/lib/normalize-sources.mjs';
import {validateSource} from '../scripts/lib/menu-contract.mjs';
import {agreeOCR} from '../scripts/lib/bluebell-auto.mjs';
import {cachedRestaurant} from '../scripts/lib/source-cache.mjs';
import {publishBluebell} from '../scripts/publish-bluebell.mjs';
import {publishSourceCache} from '../scripts/publish-source-cache.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('fixtures/'+name,import.meta.url)));

test('actual October 20 promotions remain notes and cannot become meal prices',()=>{
  for(const [id,file,soups,mains] of [['tahiti','raw-tahiti-2026-10-20.json',2,6],['stara-sypka','raw-sypka-2026-10-20.json',1,5]]) {
    const parsed=parsers[id](read(file),'2026-10-20');
    validateSource(parsed.source,'2026-10-20',id);
    assert.equal(parsed.soups.length,soups);assert.equal(parsed.mains.length,mains);
    assert.ok(parsed.notes.some(n=>/2,80€|0,10 EUR/.test(n)));
    assert.ok(parsed.mains.every(m=>!/k obedovému menu|BIREL/.test(m.name)));
    for(const item of [...parsed.soups,...parsed.mains]) {
      assert.ok(parsed.source.text.includes(item.sourceText),item.name);
    }
    const broken=read(file);
    if(id==='tahiti'){broken.lines.push('Unrecognized meal 7,00 €');assert.throws(()=>parsers[id](broken,'2026-10-20'),/price/);}
  }
});

test('Monday originals validate on Tuesday through Friday, but never in the next week',()=>{
  for(const id of ['cool-bowling','tahiti']) {
    const raw=read(id==='tahiti'?'raw-tahiti.json':'raw-cool-bowling.json');
    for(const date of ['2026-09-08','2026-09-11'])assert.doesNotThrow(()=>validateSource(parsers[id](raw,date).source,date,id,new Date(date+'T12:00:00Z')));
    assert.throws(()=>validateSource(parsers[id](raw,'2026-09-14').source,'2026-09-14',id));
  }
  const k=read('raw-kozlovna.json');
  assert.throws(()=>validateSource(parsers.kozlovna(k,'2026-09-08').source,'2026-09-08','kozlovna'),/stale capture/);
  const {candidate,passes}=read('bluebell-live-consensus.json');
  const menu=agreeOCR(passes.slice(0,2),candidate,'2026-09-11');
  assert.ok(menu);assert.doesNotThrow(()=>validateSource(menu.source,'2026-09-11','bluebell'));
  assert.throws(()=>validateSource(menu.source,'2026-09-14','bluebell'),/expired/);
});

test('a single dated daily page cannot masquerade as a reusable full weekly timetable',()=>{
  const raw=read('raw-cool-bowling.json'),menu=parsers['cool-bowling'](raw,'2026-09-08');
  menu.source.text=menu.source.sectionText;
  assert.throws(()=>validateSource(menu.source,'2026-09-08','cool-bowling'),/stale capture/);
});

test('failed collection still preserves reusable originals and diagnostics for subsequent retries',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lunch-cache-test-'));
  try {
    const root=path.join(dir,'results'),input=path.join(dir,'sources.json');
    fs.writeFileSync(input,JSON.stringify({date:'2026-09-07',sources:{'cool-bowling':read('raw-cool-bowling.json'),tahiti:read('raw-tahiti.json')},errors:[{id:'bluebell',reason:'unavailable'}]}));
    publishSourceCache(input,path.join(root,'source-cache'));
    const result=cachedRestaurant('cool-bowling','2026-09-08',root);
    assert.equal(result.parsed.source.serviceDate,'2026-09-08');
    assert.equal(result.raw.capturedAt,read('raw-cool-bowling.json').capturedAt);
    assert.equal(cachedRestaurant('cool-bowling','2026-09-14',root),null);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'source-cache/2026-09-07/diagnostics.json'))).errors[0].id,'bluebell');
    const stale=structuredClone(read('raw-tahiti.json'));stale.lines=stale.lines.map(s=>s.replace('07.09-11.09.2026','31.08-04.09.2026'));
    fs.writeFileSync(input,JSON.stringify({date:'2026-09-07',sources:{tahiti:stale}}));
    publishSourceCache(input,path.join(root,'source-cache'));
    assert.ok(cachedRestaurant('cool-bowling','2026-09-08',root));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('a failed BlueBell refresh cannot erase a previously validated weekly original',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bluebell-publish-test-'));
  try {
    const from=path.join(dir,'output'),to=path.join(dir,'results');fs.mkdirSync(from);fs.mkdirSync(to);
    const prior=read('menu-2026-09-07.json').restaurants.find(r=>r.id==='bluebell');
    fs.writeFileSync(path.join(to,'validated.json'),JSON.stringify(prior));
    fs.writeFileSync(path.join(from,'validation-error.json'),JSON.stringify({error:'No visible image'}));
    publishBluebell(from,to,'2026-09-08');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(to,'validated.json'))),prior);
    assert.ok(fs.existsSync(path.join(to,'validation-error.json')));
    fs.writeFileSync(path.join(from,'validated.json'),JSON.stringify(prior));
    assert.throws(()=>publishBluebell(from,to,'2026-09-14'),/expired/);
    publishBluebell(from,to,'2026-09-08');
    assert.equal(fs.existsSync(path.join(to,'validation-error.json')),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

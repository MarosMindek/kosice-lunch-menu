import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCoolBowling} from '../scripts/lib/normalize-sources.mjs';
import {validateSource,sha256,weeklyTimetable} from '../scripts/lib/menu-contract.mjs';

test('actual October 26 timetable separates the joined Monday heading and preserves the whole week',()=>{
  const raw=JSON.parse(fs.readFileSync(new URL('fixtures/raw-cool-bowling-2026-10-26.json',import.meta.url)));
  for(let day=26;day<=30;day++) {
    const date=`2026-10-${day}`,menu=parseCoolBowling(raw,date);
    validateSource(menu.source,date,'cool-bowling',new Date(date+'T12:00:00Z'));
    assert.deepEqual(weeklyTimetable(menu.source.text,date),{from:'2026-10-26',to:'2026-10-30'});
    assert.equal(menu.soups.length,2);
    assert.equal(menu.desserts.length,2);
    assert.equal(menu.mains.length,[8,7,8,8,7][day-26]);
    assert.equal(menu.soups[0].price,1.7);
    assert.equal(menu.soups[1].price,1.7);
    assert.ok(menu.notes.some(s=>s.startsWith('AKCIA K MENU:')&&s.endsWith('1,50€')));
    assert.equal(menu.source.text,raw.lines.join('\n'));
  }
  const monday=parseCoolBowling(raw,'2026-10-26');
  assert.equal(monday.soups[1].name,'Frankfurská polievka s klobásou');
  assert.ok(monday.source.sectionText.startsWith('26.10.26 PONDELOK:'));
  assert.ok(!monday.source.sectionText.includes('AKCIA K MENU'));
  const duplicate=structuredClone(raw);duplicate.lines.push(raw.lines.find(s=>s.includes('26.10.26 PONDELOK')));
  assert.throws(()=>parseCoolBowling(duplicate,'2026-10-26'),/ambiguous/);
  assert.throws(()=>parseCoolBowling(raw,'2026-11-02'),/Missing/);
});

test('Cool Bowling accepts the actual attached allergen marker without losing meal text or price',()=>{
  const raw={requestedUrl:'https://www.coolbowling.sk/denne-menu',capturedAt:'2026-10-23T10:00:00Z',lines:[
    '23.10.26 PIATOK: 0,25l Slepačia polievka /1,3,9/ 1,70€',
    'B.M. 100g/250g Krémové hokkaido rizoto podávané s kačacím pečeným mäskom zdobené parmezánom a rukolou/B,7/ 12,90€'
  ]};
  const m=parseCoolBowling(raw,'2026-10-23');
  assert.equal(m.mains.length,1);
  assert.equal(m.mains[0].name,'Krémové hokkaido rizoto podávané s kačacím pečeným mäskom zdobené parmezánom a rukolou');
  assert.equal(m.mains[0].price,12.9);
  assert.equal(m.mains[0].portion,'100g/250g');
  validateSource(m.source,'2026-10-23','cool-bowling',new Date('2026-10-23T11:00:00Z'));
  for(const change of [s=>s.replace('12,90€',''),s=>s+' 8,00€',s=>s.replace('/B,7/','/unknown/')]) {
    const invalid=structuredClone(raw);invalid.lines[1]=change(invalid.lines[1]);
    assert.throws(()=>parseCoolBowling(invalid,'2026-10-23'),/unparsed daily row/);
  }
});

test('the connected bridge uses the approved current template checksum',()=>{
  const bridge=fs.readFileSync(new URL('../automation/bridge.mjs',import.meta.url),'utf8');
  assert.equal(bridge.match(/const PIN='([a-f0-9]+)'/)[1],sha256(fs.readFileSync(new URL('../templates/email-v1.html',import.meta.url))));
});

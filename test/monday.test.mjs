import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCoolBowling} from '../scripts/lib/normalize-sources.mjs';
import {validateSource,sha256} from '../scripts/lib/menu-contract.mjs';

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

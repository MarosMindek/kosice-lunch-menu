import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseKozlovna} from '../scripts/lib/normalize-sources.mjs';
import {renderEmail} from '../scripts/render-email.mjs';
test('Kozlovna soups without prices remain in both email alternatives',()=>{
  const raw=JSON.parse(fs.readFileSync(new URL('fixtures/raw-kozlovna.json',import.meta.url)));
  const end=raw.lines.indexOf('Hlavné jedlá');
  raw.lines=raw.lines.filter((s,i)=>!(i<end&&/^\d+[,.]\d{2}\s*€$/.test(s)));
  const parsed=parseKozlovna(raw,'2026-09-07');
  assert.equal(parsed.soups.length,2);
  assert.ok(parsed.soups.every(s=>s.price===null));
  const menu=JSON.parse(fs.readFileSync(new URL('fixtures/menu-2026-09-07.json',import.meta.url)));
  menu.restaurants=menu.restaurants.map(r=>r.id==='kozlovna'?parsed:r);
  const msg=renderEmail(menu,{date:menu.date,now:new Date('2026-09-07T12:00:00Z')});
  for(const soup of parsed.soups){assert.ok(msg.html.includes(soup.name));assert.ok(msg.plain.includes(soup.name));}
  assert.ok(!msg.plain.includes('null'));assert.ok(!msg.plain.includes('NaN'));
  parsed.soups[0].sourceText+=' 2,10 €';
  assert.throws(()=>renderEmail(menu,{date:menu.date}),/not found|cannot be omitted/);
});

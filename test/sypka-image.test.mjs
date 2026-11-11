import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {acceptSypkaImage} from '../scripts/lib/sypka-image.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('fixtures/raw-sypka.json',import.meta.url)));
const readings=()=>[6,11].map(ocrPsm=>({...raw,requestedPdfUrl:'https://www.starasypka.sk/media/object/menu.jpeg',imageSha256:'a'.repeat(64),ocrPsm}));
test('image readings retain source URL, image provenance and all menu rows',()=>{
  const {parsed}=acceptSypkaImage(readings(),'2026-09-08');
  assert.equal(parsed.source.kind,'image-ocr');assert.ok(parsed.source.url.endsWith('.jpeg'));
  assert.equal(parsed.soups.length,1);assert.equal(parsed.mains.length,6);
});
test('image agreement cannot bypass date, price or completeness checks',()=>{
  assert.throws(()=>acceptSypkaImage(readings(),'2026-09-09'));
  assert.throws(()=>acceptSypkaImage(readings().slice(0,1),'2026-09-08'));
  const changed=readings();changed[1].pdfText=changed[1].pdfText.replace('8,90','7,90');
  assert.throws(()=>acceptSypkaImage(changed,'2026-09-08'));
});

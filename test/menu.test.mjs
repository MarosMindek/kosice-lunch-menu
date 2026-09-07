import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dateRanges, localDate, discountedCents, validateMenu, displayDate, validateSource } from '../scripts/lib/menu-contract.mjs';
import { parseBluebell, selectCandidates } from '../scripts/bluebell-select.mjs';
import { renderEmail, validateBody } from '../scripts/render-email.mjs';

const bluebell = JSON.parse(fs.readFileSync(new URL('../data/bluebell/2026-09-07.json', import.meta.url)));
const capturedAt = bluebell.source.capturedAt;
const now = new Date(new Date(capturedAt).getTime() + 1000);
const options = { date: '2026-09-07', now };
const clone = x => structuredClone(x);
const hosts = { kozlovna: 'https://kozlovnakosice.sk/', 'cool-bowling': 'https://www.coolbowling.sk/denne-menu', tahiti: 'https://www.tahitirestaurant.sk/tyzdenne-menu', 'stara-sypka': 'https://www.starasypka.sk/sk/restauracia/obedove-menu' };
export function fixture(date = '2026-09-07') {
  const restaurants = Object.entries(hosts).map(([id, url]) => {
    const dateText = displayDate(date), text = `${dateText}\nUkážková polievka 2,00 €\nUkážkové hlavné jedlo 10,90 €`;
    return { id, reviewedComplete: true, source: { kind: 'html', url, capturedAt: date === '2026-09-07' ? capturedAt : `${date}T06:00:00Z`, text, sectionText: text, dateText, serviceDate: date }, soups: [{ name: 'Ukážková polievka', price: 2, sourceText: 'Ukážková polievka 2,00 €' }], mains: [{ name: 'Ukážkové hlavné jedlo', price: 10.9, sourceText: 'Ukážkové hlavné jedlo 10,90 €' }] };
  });
  return { date, restaurants: [...restaurants, clone(bluebell)] };
}
const candidate = { href: 'https://www.facebook.com/pivarenbluebell/photos/123/', ownerUrl: 'https://www.facebook.com/pivarenbluebell/', identityText: 'Piváreň BlueBell | Kosice | Facebook', imageSha256: bluebell.source.imageSha256, capturedAt };
const currentOCR = fs.readFileSync(new URL('fixtures/bluebell-current-ocr.txt', import.meta.url), 'utf8');
const oldOCR = fs.readFileSync(new URL('fixtures/bluebell-old-ocr.txt', import.meta.url), 'utf8');

test('actual uploaded image OCR yields five current mains and the published soup labels', () => {
  const menu = parseBluebell(currentOCR, candidate, capturedAt, options.date);
  assert.deepEqual(menu.mains.map(m => m.price), [11.9, 8.9, 8.9, 8.9, 9.9]);
  assert.equal(menu.soups.length, 3);
  assert.equal(menu.source.validTo, '2026-09-11');
  assert.equal(menu.needsVisualReview, true);
});
test('last week OCR stays rejected even with a fresh capture and current Facebook caption', () => {
  assert.throws(() => parseBluebell(oldOCR, { ...candidate, caption: 'od 7.9.2026 do 11.9.2026' }, capturedAt, options.date), /expired/);
});
test('image dates cannot be supplied by caption or mixed across images', () => {
  assert.throws(() => parseBluebell(currentOCR.replace('od 7.9.2026 do 11.9.2026', ''), candidate, capturedAt, options.date), /missing_image_dates/);
  assert.throws(() => parseBluebell(currentOCR + '\nod 31.8.2026 do 4.9.2026', candidate, capturedAt, options.date), /ambiguous/);
});
test('invalid calendar dates, year rollover, leading zeros and Bratislava midnight', () => {
  assert.equal(dateRanges('od 31.2.2026 do 6.3.2026').length, 0);
  assert.equal(dateRanges('od 28.12.2026 do 1.1.2027')[0].to, '2027-01-01');
  assert.equal(dateRanges('od 07.09.2026 do 11.09.2026')[0].from, options.date);
  assert.equal(localDate(new Date('2026-09-06T22:30:00Z')), options.date);
});
test('wrong BlueBell business or old acquisition cannot qualify', () => {
  assert.throws(() => parseBluebell(currentOCR, { ...candidate, identityText: 'BlueBell Bistro cafe' }, capturedAt, options.date), /unconfirmed_pub/);
  assert.throws(() => parseBluebell(currentOCR, { ...candidate, capturedAt: '2026-08-31T07:00:00Z' }, capturedAt, options.date), /stale_capture/);
});
test('the verified weekly attachment expires instead of receiving a new date', () => {
  assert.doesNotThrow(() => validateSource(bluebell.source, '2026-09-11', 'bluebell', new Date('2026-09-11T07:00:00Z')));
  assert.throws(() => validateSource(bluebell.source, '2026-09-14', 'bluebell', new Date('2026-09-14T07:00:00Z')), /expired/);
  assert.throws(() => validateSource({ ...bluebell.source, validFrom: '2026-09-14' }, options.date, 'bluebell', now), /relabel/);
});
test('old dish or unproven price cannot be mixed into a current menu', () => {
  const m = fixture(), b = m.restaurants.find(r => r.id === 'bluebell');
  b.mains[0] = { ...b.mains[0], name: 'Konfitovaný teriyaki bôčik', sourceText: 'Konfitovaný teriyaki bôčik 11,90 €' };
  assert.throws(() => validateMenu(m, options), /not found/);
  const p = fixture(); p.restaurants.find(r => r.id === 'bluebell').mains[1].price = 9.9;
  assert.throws(() => validateMenu(p, options), /price not present/);
});
test('missing prices/categories and incomplete restaurants block the entire email', () => {
  for (const mutate of [m => m.restaurants.find(r => r.id === 'bluebell').mains.pop(), m => m.restaurants[0].soups[0].price = null, m => m.restaurants[0].reviewedComplete = false, m => m.restaurants = m.restaurants.filter(r => r.id !== 'bluebell')]) {
    const m = fixture(); mutate(m); assert.throws(() => renderEmail(m, options));
  }
});
test('Monday Sypka is closed; Tuesday requires the fifth restaurant', () => {
  const m = fixture(); m.restaurants = m.restaurants.filter(r => r.id !== 'stara-sypka');
  assert.equal(validateMenu(m, options).restaurants.at(-1).closed, true);
  const t = fixture('2026-09-08'); t.restaurants = t.restaurants.filter(r => r.id !== 'stara-sypka');
  assert.throws(() => validateMenu(t, { date: '2026-09-08', now: new Date('2026-09-08T07:00:00Z') }), /stara-sypka/);
});
test('Tahiti uses integer cents, applies 15 percent only to mains', () => {
  assert.equal(discountedCents(1090), 927); assert.equal(discountedCents(1690), 1437);
  const t = validateMenu(fixture(), options).restaurants.find(r => r.id === 'tahiti');
  assert.equal(t.mains[0].finalCents, 927); assert.equal(t.soups[0].finalCents, 200);
});
test('conflicting current images do not fall back to DOM order', () => {
  const a = clone(bluebell), b = clone(bluebell); b.mains[0].price = 12.9;
  assert.equal(selectCandidates([a, b]).selected, null);
  const soupChanged = clone(a); soupChanged.soups[0].price = 2.5;
  assert.equal(selectCandidates([a, soupChanged]).selected, null);
  assert.ok(selectCandidates([a, clone(a)]).selected);
});
test('HTML and plain text are deterministic, complete and reject edits before sending', () => {
  const input = fixture(), a = renderEmail(input, options), b = renderEmail(input, options);
  assert.equal(a.html, b.html); assert.equal(a.plain, b.plain);
  assert.equal(a.html.match(/kosice-lunch-email-v1/g).length, 2);
  assert.ok(!/<script|<img|<link|<iframe|\{\{/i.test(a.html));
  for (const r of validateMenu(input, options).restaurants) for (const i of r.mains) assert.ok(a.plain.includes(i.name));
  assert.ok(a.html.indexOf('Kozlovňa') < a.html.indexOf('Cool Bowling'));
  assert.throws(() => validateBody({ ...a, html: a.html.replace('8,90 €', '9,90 €') }, input, options), /differs/);
});

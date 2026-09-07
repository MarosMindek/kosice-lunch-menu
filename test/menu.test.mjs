import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dateRanges, localDate, discountedCents, validateMenu, displayDate, validateSource } from '../scripts/lib/menu-contract.mjs';
import { parseBluebell, selectCandidates } from '../scripts/bluebell-select.mjs';
import { renderEmail, validateBody } from '../scripts/render-email.mjs';
import { publicImageVariants } from '../scripts/lib/facebook-images.mjs';

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

test('public image resizing keeps image identity/signature and the original fallback URL', () => {
  const src = 'https://scontent.example.fbcdn.net/menu.jpg?cstp=mx1080x1080&ctp=s206x206&oh=example&oe=example';
  const urls = publicImageVariants(src);
  assert.equal(urls.length, 2); assert.equal(urls[1], src);
  assert.equal(new URL(urls[0]).pathname, new URL(src).pathname);
  assert.equal(new URL(urls[0]).searchParams.get('ctp'), 's1080x1080');
  for (const key of ['oh', 'oe', 'cstp']) assert.equal(new URL(urls[0]).searchParams.get(key), new URL(src).searchParams.get(key));
  // The current weekly image was served as p526x296, not an s206x206 gallery thumbnail.
  assert.equal(new URL(publicImageVariants(src.replace('s206x206', 'p526x296'))[0]).searchParams.get('ctp'), 's1080x1080');
  assert.throws(() => publicImageVariants('https://fbcdn.net.example.com/menu.jpg'));
});

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

const realMenu = JSON.parse(fs.readFileSync(new URL('fixtures/menu-2026-09-07.json', import.meta.url)));
const realOptions = { date: '2026-09-07', now: new Date('2026-09-07T12:00:00Z') };
test('actual September 7 sources render every meal, garnish, dessert and published price', () => {
  const m = validateMenu(realMenu, realOptions), message = renderEmail(realMenu, realOptions);
  assert.deepEqual(m.restaurants.map(r => [r.soups.length, r.mains.length, r.desserts?.length || 0]), [[2,4,0],[2,8,2],[2,6,0],[3,5,0],[0,0,0]]);
  for (const r of m.restaurants) for (const i of [...r.soups, ...r.mains, ...(r.desserts || [])]) {
    for (const value of [i.name, i.description, i.portion].filter(Boolean)) assert.ok(message.plain.includes(value), value);
  }
  assert.deepEqual(m.restaurants[2].mains.map(i => i.finalCents), [1437,799,799,799,799,799]);
  assert.ok(message.plain.includes('💶 NAJLACNEJŠIE: Kozlovňa Košice'));
  assert.ok(message.html.includes('DEZERTY'));
  assert.equal(message.html, renderEmail(clone(realMenu), realOptions).html);
  assert.doesNotThrow(() => validateBody(message, realMenu, realOptions));
});
test('short printed years cannot turn last year or a mixed daily section into today', () => {
  for (const change of [
    s => { s.text = s.text.replaceAll('07.09.26', '07.09.25'); s.sectionText = s.sectionText.replaceAll('07.09.26', '07.09.25'); s.dateText = s.dateText.replace('26', '25'); },
    s => { s.text += '\n08.09.26 UTOROK'; s.sectionText += '\n08.09.26 UTOROK'; }
  ]) {
    const m = clone(realMenu); change(m.restaurants[1].source);
    assert.throws(() => renderEmail(m, realOptions), /mixed dates|today's section/);
  }
});
test('a shared Tahiti week requires a current bounded range and no daily or conflicting headings', () => {
  for (const [from, to] of [['07.09-11.09.2026', '31.08-04.09.2026'], ['07.09-11.09.2026', '07.09-18.09.2026']]) {
    const m = clone(realMenu), s = m.restaurants[2].source;
    for (const key of ['text', 'sectionText', 'dateText']) s[key] = s[key].replace(from, to);
    assert.throws(() => renderEmail(m, realOptions), /wrong weekly/);
  }
  for (const extra of ['UTOROK', '14.09.2026']) {
    const m = clone(realMenu), s = m.restaurants[2].source;
    s.text += '\n' + extra; s.sectionText += '\n' + extra;
    assert.throws(() => renderEmail(m, realOptions), /shared weekly|mixed dates/);
  }
});
test('unproven side dishes, portions and pending image review block sending', () => {
  for (const field of ['description', 'portion']) {
    const m = clone(realMenu); m.restaurants[0].mains[0][field] = 'vymyslený údaj';
    assert.throws(() => renderEmail(m, realOptions), /unproven/);
  }
  const m = clone(realMenu); m.restaurants[3].needsVisualReview = true;
  assert.throws(() => renderEmail(m, realOptions), /needs visual review/);
});

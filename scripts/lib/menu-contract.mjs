import { createHash } from 'node:crypto';

export const TIMEZONE = 'Europe/Bratislava';
export const ORDER = ['kozlovna', 'cool-bowling', 'tahiti', 'bluebell', 'stara-sypka'];
export const NAMES = { kozlovna: 'Kozlovňa Košice', 'cool-bowling': 'Cool Bowling', tahiti: 'Tahiti Restaurant', bluebell: 'Piváreň BlueBell', 'stara-sypka': 'Stará Sýpka' };
export const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const normalized = s => fold(s).replace(/[^a-z0-9]+/g, '');
export const sha256 = s => createHash('sha256').update(s).digest('hex');
export function localDate(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function dateISO(day, month, year) {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
export function validISO(iso) { return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && dateISO(iso.slice(8), iso.slice(5, 7), iso.slice(0, 4)) === iso; }
export const displayDate = iso => iso.split('-').reverse().join('.');
export const weekday = iso => new Date(`${iso}T12:00:00Z`).getUTCDay();
export function dateRanges(text) {
  // Dates must come from ONE menu image/document, never search queries or capture metadata.
  const ranges = [];
  const re = /(?<!\d)(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\s*(?:do|až|az|[-–—])\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})(?!\d)/gi;
  for (const m of String(text).matchAll(re)) {
    const from = dateISO(m[1], m[2], m[3]), to = dateISO(m[4], m[5], m[6]);
    if (from && to && from <= to) ranges.push({ from, to, text: m[0] });
  }
  return [...new Map(ranges.map(r => [`${r.from}/${r.to}`, r])).values()];
}
export function explicitDates(text) {
  return [...String(text).matchAll(/(?<!\d)(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})(?!\d)/g)].map(m => dateISO(m[1], m[2], m[3])).filter(Boolean);
}
export function moneyCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) throw Error('Invalid published price');
    return Math.round(value * 100);
  }
  const match = String(value).trim().match(/^(\d{1,3})[,.](\d{2})\s*(?:€|eur)?$/i);
  if (!match || +match[1] * 100 + +match[2] <= 0) throw Error('Missing/invalid published price');
  return +match[1] * 100 + +match[2];
}
export const discountedCents = cents => Math.floor((cents * 85 + 50) / 100);
export const euro = cents => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')} €`;
export function officialBluebell(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (['pivarenbluebell.sk', 'www.pivarenbluebell.sk'].includes(u.hostname) ||
      (['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(u.hostname) && /^\/pivarenbluebell(?:\/|$)/i.test(u.pathname)));
  } catch { return false; }
}
export function bluebellIdentity(source) {
  const identity = fold(source.identityText);
  return officialBluebell(source.ownerUrl || source.url) && /blue\s*bell/.test(identity) && /pivaren|pub/.test(identity) && !/bistro|kaviaren|cafe/.test(identity);
}
export function validateSource(source, date, id, now = new Date()) {
  if (!source || !source.url || !source.text?.trim() || !source.dateText?.trim()) throw Error(`${id}: missing source evidence`);
  const u = new URL(source.url);
  if (u.protocol !== 'https:' || u.username || u.password) throw Error(`${id}: invalid source URL`);
  if (!source.text.includes(source.dateText)) throw Error(`${id}: date must be in the same menu document`);
  const captured = new Date(source.capturedAt);
  if (!Number.isFinite(+captured) || +captured > +now + 5 * 60_000) throw Error(`${id}: invalid capture time`);
  if (source.kind !== 'verified-image' && localDate(captured) !== date) throw Error(`${id}: stale capture; refresh source`);
  if (id === 'bluebell') {
    if (!bluebellIdentity(source)) throw Error('bluebell: unconfirmed pub identity');
    if (!['image-ocr', 'verified-image'].includes(source.kind) || !/^[a-f0-9]{64}$/.test(source.imageSha256 || '')) throw Error('bluebell: missing image provenance');
    const ranges = dateRanges(source.text);
    if (ranges.length !== 1 || ranges[0].from > date || ranges[0].to < date || (new Date(ranges[0].to) - new Date(ranges[0].from)) / 86400000 > 6) throw Error('bluebell: image is expired, future, ambiguous or undated');
    if (source.validFrom !== ranges[0].from || source.validTo !== ranges[0].to) throw Error('bluebell: do not relabel source dates');
    if (source.kind === 'verified-image' && source.verification !== 'visual-transcription') throw Error('bluebell: unreviewed image');
  } else {
    const permitted = { kozlovna: ['kozlovnakosice.sk'], 'cool-bowling': ['www.coolbowling.sk', 'coolbowling.sk'], tahiti: ['www.tahitirestaurant.sk', 'tahitirestaurant.sk', 'menu.andiamogroup.eu'], 'stara-sypka': ['www.starasypka.sk', 'starasypka.sk'] };
    if (!permitted[id]?.includes(u.hostname)) throw Error(`${id}: unrecognized restaurant source`);
    if (!source.sectionText?.trim() || !normalized(source.text).includes(normalized(source.sectionText))) throw Error(`${id}: missing isolated daily section`);
    if (explicitDates(source.sectionText).some(d => d !== date)) throw Error(`${id}: mixed dates in daily section`);
    const ranges = dateRanges(source.dateText);
    if (source.scope === 'weekly' && id === 'tahiti') {
      if (ranges.length !== 1 || ranges[0].from > date || ranges[0].to < date || source.serviceDate !== date) throw Error(`${id}: wrong weekly/day section`);
      const dayNames = ['nedela', 'pondelok', 'utorok', 'streda', 'stvrtok', 'piatok', 'sobota'];
      if (!source.dayText || !source.sectionText.includes(source.dayText) || !(explicitDates(source.dayText).includes(date) || fold(source.dayText).trim() === dayNames[weekday(date)])) throw Error(`${id}: weekday heading not confirmed`);
      const headings = dayNames.filter(d => new RegExp(`\\b${d}\\b`).test(fold(source.sectionText)));
      if (headings.some(d => d !== dayNames[weekday(date)])) throw Error(`${id}: mixed weekdays`);
    } else if (!explicitDates(source.dateText).includes(date) || source.serviceDate !== date || !source.sectionText.includes(source.dateText)) throw Error(`${id}: today's section not confirmed`);
  }
}
export function validateMenu(data, { date = localDate(), now = new Date() } = {}) {
  if (!validISO(date) || data.date !== date) throw Error('Wrong email date');
  if ([0, 6].includes(weekday(date))) throw Error('Weekend: no lunch email');
  const restaurants = data.restaurants;
  if (!Array.isArray(restaurants) || new Set(restaurants.map(r => r.id)).size !== restaurants.length || restaurants.some(r => !ORDER.includes(r.id))) throw Error('Duplicate/unknown restaurants');
  const normalizedRestaurants = ORDER.map(id => {
    if (id === 'stara-sypka' && weekday(date) === 1) return { id, name: NAMES[id], closed: true, soups: [], mains: [] };
    const r = restaurants.find(r => r.id === id);
    if (!r || r.closed) throw Error(`${id}: required restaurant missing`);
    validateSource(r.source, date, id, now);
    if (!r.soups?.length || !r.mains?.length || r.reviewedComplete !== true) throw Error(`${id}: incomplete menu`);
    const normalizeItems = (items, isMain) => items.map(item => {
      if (!item.name?.trim() || !item.sourceText?.trim()) throw Error(`${id}: unnamed/unproven meal`);
      const evidenceText = id === 'bluebell' ? r.source.text : r.source.sectionText;
      if (!normalized(evidenceText).includes(normalized(item.sourceText)) || !normalized(item.sourceText).includes(normalized(item.name))) throw Error(`${id}: meal not found in this source`);
      const cents = moneyCents(item.price);
      const prices = [...item.sourceText.matchAll(/(?<!\d)(\d{1,3}[,.]\d{2})\s*(?:€|eur)/gi)].map(m => moneyCents(m[1]));
      if (!prices.includes(cents)) throw Error(`${id}: price not present beside meal evidence`);
      return { ...item, priceCents: cents, finalCents: id === 'tahiti' && isMain ? discountedCents(cents) : cents };
    });
    const soups = normalizeItems(r.soups, false), mains = normalizeItems(r.mains, true);
    if (id === 'bluebell') {
      const expected = ['biznis', 'tradicne', 'veggie', 'special-1', 'special-2'];
      if (mains.length !== expected.length || !expected.every(x => mains.some(i => i.category === x))) throw Error('bluebell: all five published menu categories required');
    }
    return { ...r, name: NAMES[id], soups, mains };
  });
  return { date, restaurants: normalizedRestaurants };
}

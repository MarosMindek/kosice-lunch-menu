import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fold, dateRanges, localDate, moneyCents, bluebellIdentity, sha256 } from './lib/menu-contract.mjs';

export function parseBluebell(text, candidate, capturedAt, date = localDate()) {
  const source = { kind: 'image-ocr', url: candidate.href, ownerUrl: candidate.ownerUrl, identityText: candidate.identityText, capturedAt: candidate.capturedAt || capturedAt, imageSha256: candidate.imageSha256, text };
  if (!bluebellIdentity(source)) throw Error('unconfirmed_pub');
  if (localDate(new Date(source.capturedAt)) !== date) throw Error('stale_capture');
  const ranges = dateRanges(text);
  if (ranges.length !== 1) throw Error('ambiguous_or_missing_image_dates');
  const range = ranges[0];
  if (range.from > date || range.to < date) throw Error('expired_or_future_image');
  Object.assign(source, { dateText: range.text, validFrom: range.from, validTo: range.to });
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const specs = [['biznis', /^biznis\s+menu/], ['tradicne', /^tradicne\s+menu/], ['veggie', /^veggie\s+menu/], ['special-1', /^special\s+menu\s*1/], ['special-2', /^special\s+menu\s*2/]];
  const mains = specs.map(([category, pattern]) => {
    const matches = lines.map((x, i) => pattern.test(fold(x)) ? i : -1).filter(i => i >= 0);
    if (matches.length !== 1) throw Error(`missing_or_duplicate_${category}`);
    const start = matches[0], price = lines[start].match(/(\d{1,2}[,.]\d{2})\s*€/);
    if (!price) throw Error(`unreadable_price_${category}`);
    let end = start + 1;
    while (end < lines.length && !/^(?:biznis|tradicne|veggie|special)\s+menu|^osobny|^www\.|^bolt|^\+\s*421/i.test(fold(lines[end]))) end++;
    const name = lines.slice(start + 1, end).join(' ').replace(/\s+\d{2,3}(?:\s*\/\s*\d{2,3})*\s*g\b.*$/i, '').trim();
    if (name.length < 12) throw Error(`unreadable_meal_${category}`);
    return { category, name, price: moneyCents(price[1]) / 100, sourceText: lines.slice(start, end).join('\n') };
  });
  const firstMain = lines.findIndex(x => /^biznis\s+menu/.test(fold(x)));
  const soups = lines.slice(0, firstMain).flatMap(line => {
    const m = line.match(/^(?:0[,.]33\s*[l1I]?\s*)(.+?)\s+(\d{1,2}[,.]\d{2})\s*€/i);
    return m ? [{ name: m[1].trim(), price: moneyCents(m[2]) / 100, sourceText: line }] : [];
  });
  if (soups.length < 2) throw Error('unreadable_soups');
  return { id: 'bluebell', source, soups, mains, reviewedComplete: false, needsVisualReview: true };
}
export function selectCandidates(candidates) {
  if (!candidates.length) return { status: 'unavailable', selected: null };
  const fingerprints = new Set(candidates.map(c => JSON.stringify([c.source.validFrom, c.source.validTo, c.soups.map(m => [fold(m.name), m.price]), c.mains.map(m => [m.category, fold(m.name), m.price])])));
  if (fingerprints.size > 1) return { status: 'conflicting_current_images', selected: null };
  return { status: 'needs_visual_review', selected: candidates[0] };
}
export function run(directory = 'output/bluebell-hires', date = localDate()) {
  const meta = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8')), accepted = [], rejected = [], reviewCandidates = [];
  for (const c of meta.candidates || []) {
    if (!c.saved) continue;
    const imagePath = path.join(directory, path.basename(c.saved.file));
    if (!c.imageSha256 || sha256(fs.readFileSync(imagePath)) !== c.imageSha256) { rejected.push({ file: c.saved.file, reason: 'image_hash_mismatch' }); continue; }
    let parsed, reasons = [], ocrByMode = {};
    // OCR modes and different images never get concatenated into one menu.
    for (const psm of [6, 11]) {
      const file = path.join(directory, 'ocr', `${path.parse(c.saved.file).name}-psm${psm}.txt`);
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8'); ocrByMode[psm] = text;
      try { parsed = parseBluebell(text, c, meta.capturedAt, date); break; } catch (e) { reasons.push(e.message); }
    }
    if (parsed) accepted.push({ ...parsed, imageFile: c.saved.file });
    else {
      const reason = reasons.join(', ') || 'no_ocr';
      rejected.push({ file: c.saved.file, href: c.href, reason });
      const looksLikeMenu = Object.values(ocrByMode).some(t => [...fold(t).matchAll(/(?:biznis|tradicne|veggie|special)\s*menu/g)].length >= 3);
      const knownExpired = Object.values(ocrByMode).flatMap(dateRanges).some(r => r.to < date || r.from > date);
      // A reviewer may read the SAME image when OCR is unclear, but this is never sendable data.
      if (looksLikeMenu && !knownExpired) reviewCandidates.push({ imageFile: c.saved.file, href: c.href, ownerUrl: c.ownerUrl, identityText: c.identityText, imageSha256: c.imageSha256, capturedAt: c.capturedAt || meta.capturedAt, needsVisualReview: true, reason, ocrByMode });
    }
  }
  const selection = { date, capturedAt: meta.capturedAt, ...selectCandidates(accepted), candidates: accepted, rejected, reviewCandidates };
  if (selection.status === 'unavailable' && reviewCandidates.length) selection.status = 'needs_visual_review';
  fs.writeFileSync(path.join(directory, 'selection.json'), JSON.stringify(selection, null, 2));
  console.log(JSON.stringify({ status: selection.status, currentImages: accepted.length, rejected: rejected.length }));
  return selection;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) run(process.argv[2], process.argv[3]);

import { chromium } from 'playwright';
import fs from 'node:fs';
import { sha256, fold, localDate, dateRanges } from './lib/menu-contract.mjs';

const OUT = 'output/bluebell-hires';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'sk-SK', timezoneId: 'Europe/Bratislava', viewport: { width: 1440, height: 1800 } });
ctx.setDefaultTimeout(2500);
const ownerUrl = 'https://www.facebook.com/pivarenbluebell/';
const today = localDate(), seen = new Map(), errors = [], candidates = [];
const captureDeadline = Date.now() + 6 * 60_000;
function photoId(href) {
  try { const u = new URL(href); return u.searchParams.get('fbid') || u.pathname.match(/\/photos\/(\d+)/)?.[1] || null; } catch { return null; }
}
async function dismiss(page, closePrompt = true) {
  for (const label of ['Allow only essential cookies', 'Použiť iba nevyhnutné', 'Odmietnuť voliteľné cookies']) await page.getByText(label, { exact: false }).first().click({ timeout: 700 }).catch(() => {});
  if (closePrompt) for (const label of ['Close', 'Zavrieť']) await page.getByRole('button', { name: label, exact: true }).last().click({ timeout: 700 }).catch(() => {});
}
try {
  // Capture each scroll: Facebook virtualizes earlier cards out of the DOM.
  for (const [source, url] of [['posts', `${ownerUrl}posts/`], ['photos', `${ownerUrl}photos/`], ['page', ownerUrl]]) {
    const p = await ctx.newPage();
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await p.waitForTimeout(3500); await dismiss(p);
      const identityText = await p.title();
      if (!/pivaren\s*blue\s*bell|blue\s*bell.*pub/i.test(fold(identityText))) throw Error('Unconfirmed Facebook page owner');
      for (let scroll = 0; scroll < 5; scroll++) {
        const links = await p.locator('a').evaluateAll(as => as.flatMap(a => {
          const img = a.querySelector('img');
          if (!img || !/\/photo|[?&]fbid=/.test(a.href)) return [];
          const article = a.closest('[role="article"], [data-pagelet*="FeedUnit"]');
          return [{ href: a.href, src: img.currentSrc || img.src, alt: img.alt || '', w: img.naturalWidth, h: img.naturalHeight, caption: (article?.innerText || '').slice(0, 3500) }];
        }));
        for (const c of links) {
          const fbid = photoId(c.href), old = seen.get(fbid);
          if (fbid && c.src && Math.max(c.w, c.h) >= 120 && (!old || c.w * c.h > old.w * old.h)) seen.set(fbid, { ...c, fbid, source, ownerUrl, identityText });
        }
        await p.mouse.wheel(0, 1050); await p.waitForTimeout(650);
      }
      fs.writeFileSync(`${OUT}/${source}.txt`, await p.locator('body').innerText());
    } catch (e) { errors.push({ source, error: String(e) }); }
    finally { await p.close(); }
  }
  const score = c => (dateRanges(c.caption).some(r => r.from <= today && r.to >= today) ? 10 : 0) + (/tyzd|menu|obed/.test(fold(`${c.alt} ${c.caption}`)) ? 2 : 0);
  const recent = [...seen.values()].sort((a, b) => score(b) - score(a)).slice(0, 24), hashes = new Set();
  for (const [i, c] of recent.entries()) {
    if (Date.now() > captureDeadline) { errors.push({ source: 'capture', error: 'Capture time budget reached; remaining candidates were not inspected' }); break; }
    let p;
    try {
      let src = c.src;
      // Use real viewer URLs; do not rewrite signed Facebook CDN parameters.
      if (c.w < 600 || c.h < 400) {
        p = await ctx.newPage();
        await p.goto(c.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await p.waitForTimeout(1800); await dismiss(p, false);
        if (photoId(p.url()) !== c.fbid) throw Error('Photo viewer redirected');
        const images = await p.locator('img').evaluateAll(xs => xs.map(x => ({ src: x.currentSrc || x.src, w: x.naturalWidth, h: x.naturalHeight })).filter(x => x.w >= 600 && x.h >= 400).sort((a, b) => b.w * b.h - a.w * a.h));
        if (!images.length) throw Error('Full image unavailable');
        src = images[0].src;
      }
      const u = new URL(src);
      if (u.protocol !== 'https:' || !u.hostname.endsWith('.fbcdn.net')) throw Error('Unexpected image host');
      const response = await ctx.request.get(src, { timeout: 15000, headers: { referer: ownerUrl } });
      const contentType = response.headers()['content-type'] || '';
      if (!response.ok() || !/^image\/(jpeg|png|webp)/.test(contentType)) throw Error('Image download failed');
      const bytes = await response.body(), imageSha256 = sha256(bytes);
      if (bytes.length < 5000) throw Error('Image too small');
      if (hashes.has(imageSha256)) continue;
      hashes.add(imageSha256);
      const file = `gallery-${String(i + 1).padStart(2, '0')}.${contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'}`;
      fs.writeFileSync(`${OUT}/${file}`, bytes);
      candidates.push({ ...c, capturedAt: new Date().toISOString(), imageSha256, saved: { file, bytes: bytes.length, contentType } });
    } catch (e) { candidates.push({ ...c, error: String(e) }); }
    finally { if (p) await p.close(); }
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/metadata.json`, JSON.stringify({ capturedAt: new Date().toISOString(), ownerUrl, candidateCount: seen.size, candidates, errors }, null, 2));
}
console.log(JSON.stringify({ discovered: seen.size, downloaded: candidates.filter(c => c.saved).length, errors }));

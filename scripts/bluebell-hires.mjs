import { chromium } from 'playwright';
import fs from 'node:fs';
import { sha256, fold, localDate, dateRanges } from './lib/menu-contract.mjs';
import { publicImageVariants } from './lib/facebook-images.mjs';

const OUT = 'output/bluebell-hires';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: 'sk-SK', timezoneId: 'Europe/Bratislava', viewport: { width: 1440, height: 1800 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
});
ctx.setDefaultTimeout(3000);
const ownerUrl = 'https://www.facebook.com/pivarenbluebell/';
const today = localDate(), seen = new Map(), errors = [], candidates = [];
const captureDeadline = Date.now() + 8 * 60_000;

function photoId(href) {
  try { const u = new URL(href); return u.searchParams.get('fbid') || u.pathname.match(/\/photos\/(\d+)/)?.[1] || null; } catch { return null; }
}
function candidateKey(c) { return c.fbid || c.src?.split('?')[0] || c.href; }
async function dismiss(page, closePrompt = true) {
  for (const label of ['Allow only essential cookies', 'Použiť iba nevyhnutné', 'Odmietnuť voliteľné cookies']) await page.getByText(label, { exact: false }).first().click({ timeout: 800 }).catch(() => {});
  if (closePrompt) for (const label of ['Close', 'Zavrieť']) await page.getByRole('button', { name: label, exact: true }).last().click({ timeout: 800 }).catch(() => {});
  for (const label of ['Zobraziť viac', 'See more']) {
    const xs = page.getByText(label, { exact: false });
    for (let i = 0; i < Math.min(await xs.count().catch(() => 0), 8); i++) await xs.nth(i).click({ timeout: 500 }).catch(() => {});
  }
}
function identityLooksRight(text) {
  const s = fold(text);
  return /blue\s*bell/.test(s) && /pivaren|pub/.test(s) && !(/bistro|kaviaren|cafe/.test(s) && !/pivaren|pub/.test(s));
}

try {
  const plugin = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(ownerUrl)}&tabs=timeline&width=500&height=1800&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false`;
  const routes = [
    ['posts', `${ownerUrl}posts/`],
    ['photos', `${ownerUrl}photos/`],
    ['page', ownerUrl],
    ['mobile', 'https://m.facebook.com/pivarenbluebell/'],
    ['plugin', plugin]
  ];

  // Capture each scroll: Facebook virtualizes earlier cards out of the DOM.  We also inspect
  // large unlinked fbcdn images because the public page/plugin sometimes renders the menu image
  // without a stable /photo anchor when logged out.
  for (const [source, url] of routes) {
    const p = await ctx.newPage();
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await p.waitForTimeout(4500); await dismiss(p);
      const identityText = `${await p.title().catch(() => '')}\n${(await p.locator('body').innerText().catch(() => '')).slice(0, 5000)}`;
      if (source !== 'plugin' && !identityLooksRight(identityText)) throw Error('Unconfirmed Facebook page owner');
      if (source === 'plugin' && !/blue\s*bell/i.test(fold(identityText))) throw Error('Unconfirmed Facebook plugin owner');

      for (let scroll = 0; scroll < 10; scroll++) {
        await dismiss(p, false);
        const imgs = await p.locator('img').evaluateAll(xs => xs.flatMap(img => {
          const src = img.currentSrc || img.src || '';
          if (!/fbcdn\.net/i.test(src)) return [];
          const a = img.closest('a');
          const article = img.closest('[role="article"], [data-pagelet*="FeedUnit"], blockquote');
          return [{
            href: a?.href || '', src, alt: img.alt || '', w: img.naturalWidth, h: img.naturalHeight,
            caption: (article?.innerText || a?.innerText || '').slice(0, 5000)
          }];
        }));
        for (const raw of imgs) {
          if (!raw.src || Math.max(raw.w, raw.h) < 280 || raw.w * raw.h < 100000) continue;
          const fbid = photoId(raw.href), c = { ...raw, fbid, source, ownerUrl, identityText: identityText.slice(0, 1500) };
          const key = candidateKey(c), old = seen.get(key);
          if (key && (!old || c.w * c.h > old.w * old.h || c.caption.length > old.caption.length)) seen.set(key, c);
        }
        await p.mouse.wheel(0, 1150); await p.waitForTimeout(750);
      }
      fs.writeFileSync(`${OUT}/${source}.txt`, await p.locator('body').innerText().catch(() => ''));
    } catch (e) { errors.push({ source, url, error: String(e) }); }
    finally { await p.close(); }
  }

  const score = c => {
    const text = `${c.alt} ${c.caption}`;
    return (dateRanges(text).some(r => r.from <= today && r.to >= today) ? 100 : 0)
      + (/tyzd|menu|obed|biznis|tradic|veggie|special/.test(fold(text)) ? 25 : 0)
      + Math.min(20, Math.floor((c.w * c.h) / 150000));
  };
  const recent = [...seen.values()].sort((a, b) => score(b) - score(a)).slice(0, 36), hashes = new Set();
  for (const [i, c] of recent.entries()) {
    if (Date.now() > captureDeadline) { errors.push({ source: 'capture', error: 'Capture time budget reached; remaining candidates were not inspected' }); break; }
    try {
      let bytes, contentType, downloadedUrl;
      for (const src of publicImageVariants(c.src)) {
        try {
          const response = await ctx.request.get(src, { timeout: 12000, headers: { referer: ownerUrl, 'cache-control': 'no-cache' } });
          const type = response.headers()['content-type'] || '';
          if (!response.ok() || !/^image\/(jpeg|png|webp)/.test(type)) continue;
          const body = await response.body();
          if (body.length < 5000) continue;
          bytes = body; contentType = type; downloadedUrl = src; break;
        } catch { /* Keep the failure local to this exact image/size. */ }
      }
      if (!bytes) throw Error('Public image download failed');
      const imageSha256 = sha256(bytes);
      if (hashes.has(imageSha256)) continue;
      hashes.add(imageSha256);
      const file = `gallery-${String(i + 1).padStart(2, '0')}.${contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'}`;
      fs.writeFileSync(`${OUT}/${file}`, bytes);
      candidates.push({ ...c, score: score(c), capturedAt: new Date().toISOString(), imageSha256, saved: { file, bytes: bytes.length, contentType, url: downloadedUrl } });
    } catch (e) { candidates.push({ ...c, score: score(c), error: String(e) }); }
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/metadata.json`, JSON.stringify({ capturedAt: new Date().toISOString(), today, ownerUrl, candidateCount: seen.size, candidates, errors }, null, 2));
}
console.log(JSON.stringify({ discovered: seen.size, downloaded: candidates.filter(c => c.saved).length, top: candidates.slice(0, 8).map(c => ({ source: c.source, score: c.score, fbid: c.fbid, saved: c.saved?.file, caption: c.caption?.slice(0, 180) })), errors }));

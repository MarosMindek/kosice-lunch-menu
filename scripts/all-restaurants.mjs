import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'output/all-restaurants';
fs.mkdirSync(OUT, { recursive: true });

const TZ = 'Europe/Bratislava';
const localParts = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
);

const yyyy = localParts.year;
const mm = localParts.month;
const dd = localParts.day;
const today = `${dd}.${mm}.${yyyy}`;
const base = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
const mondayOffset = (base.getUTCDay() + 6) % 7;
const monday = new Date(base);
monday.setUTCDate(base.getUTCDate() - mondayOffset);
const friday = new Date(monday);
friday.setUTCDate(monday.getUTCDate() + 4);

function fmtDate(d, padded = true) {
  const D = padded ? String(d.getUTCDate()).padStart(2, '0') : String(d.getUTCDate());
  const M = padded ? String(d.getUTCMonth() + 1).padStart(2, '0') : String(d.getUTCMonth() + 1);
  return `${D}.${M}.${d.getUTCFullYear()}`;
}

const weekStart = fmtDate(monday);
const weekEnd = fmtDate(friday);
const weekStartLoose = fmtDate(monday, false);
const weekEndLoose = fmtDate(friday, false);

const needles = [
  `${dd}.${mm}.${yyyy}`,
  `${Number(dd)}.${Number(mm)}.${yyyy}`,
  `${dd}. ${mm}. ${yyyy}`,
  `${dd}.${mm}.${String(yyyy).slice(-2)}`
];

const clean = t => t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const squash = t => t.replace(/\s/g, '').toLowerCase();
const hasToday = t => needles.some(n => squash(t).includes(squash(n)));
const hasCurrentWeek = t => {
  const s = squash(t);
  const starts = [weekStart, weekStartLoose, weekStart.replace(/\./g, '. '), weekStart.slice(0, -4) + String(yyyy).slice(-2)];
  const ends = [weekEnd, weekEndLoose, weekEnd.replace(/\./g, '. '), weekEnd.slice(0, -4) + String(yyyy).slice(-2)];
  return starts.some(x => s.includes(squash(x))) && ends.some(x => s.includes(squash(x)));
};

async function save(page, name, requestedUrl, status) {
  const text = await page.locator('body').innerText().catch(() => '');
  const html = await page.content().catch(() => '');
  const lines = clean(text);
  const data = {
    name,
    requestedUrl,
    finalUrl: page.url(),
    status,
    title: await page.title().catch(() => ''),
    today,
    weekStart,
    weekEnd,
    hasToday: hasToday(text),
    hasCurrentWeek: hasCurrentWeek(text),
    lines
  };
  fs.writeFileSync(`${OUT}/${name}.txt`, text);
  fs.writeFileSync(`${OUT}/${name}.html`, html);
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }).catch(() => {});
  return data;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'sk-SK',
  timezoneId: TZ,
  viewport: { width: 1440, height: 1400 }
});

await context.route('**/*', async route => {
  const req = route.request();
  if (['font', 'media'].includes(req.resourceType())) return route.abort();
  await route.continue({
    headers: {
      ...req.headers(),
      'cache-control': 'no-cache, no-store, max-age=0',
      pragma: 'no-cache'
    }
  }).catch(() => {});
});

const results = { today, weekStart, weekEnd, generatedAt: new Date().toISOString(), pages: {} };

async function visit(name, url, wait = 6000, scroll = 6) {
  const p = await context.newPage();
  try {
    const separator = url.includes('?') ? '&' : '?';
    const cacheBustedUrl = `${url}${separator}_cb=${Date.now()}`;
    const resp = await p.goto(cacheBustedUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForTimeout(wait);
    for (let i = 0; i < scroll; i++) {
      await p.mouse.wheel(0, 1200);
      await p.waitForTimeout(500);
    }
    await p.evaluate(() => scrollTo(0, 0)).catch(() => {});
    results.pages[name] = await save(p, name, url, resp?.status() ?? null);
  } catch (e) {
    results.pages[name] = { requestedUrl: url, error: String(e), today, weekStart, weekEnd };
    fs.writeFileSync(`${OUT}/${name}.error.txt`, String(e));
  }
  await p.close();
}

await visit('kozlovna', 'https://kozlovnakosice.sk/#obedove-menu', 8000, 8);
await visit('cool-bowling', 'https://www.coolbowling.sk/denne-menu');
await visit('tahiti-weekly', 'https://www.tahitirestaurant.sk/tyzdenne-menu', 7000, 10);
await visit('tahiti-andiamo', 'https://menu.andiamogroup.eu/chickin/denne-menu', 7000, 10);
await visit('bluebell-site', 'https://pivarenbluebell.sk/');
await visit('bluebell-wolt', 'https://wolt.com/sk/svk/kosice/restaurant/bluebell-bistro', 8000, 12);
await visit('bluebell-facebook', 'https://www.facebook.com/pivarenbluebell/', 8000, 6);
await visit(
  'bluebell-bing',
  `https://www.bing.com/search?q=${encodeURIComponent(`Piváreň BlueBell Košice ${weekStart} ${weekEnd} týždenné menu`)}`,
  5000,
  2
);
await visit('stara-sypka-home', 'https://www.starasypka.sk/sk/', 7000, 6);

const keywordRe = /(€|EUR|menu|poliev|hlavn|pondelok|utorok|streda|štvrtok|piatok|kozlov|tahiti|bluebell|sýpka|sypka)/i;
for (const [n, d] of Object.entries(results.pages)) {
  console.log(`\n===== ${n} =====`);
  console.log(JSON.stringify({
    url: d.finalUrl || d.requestedUrl,
    status: d.status,
    title: d.title,
    hasToday: d.hasToday,
    hasCurrentWeek: d.hasCurrentWeek,
    error: d.error
  }, null, 2));
  if (d.lines) {
    const hits = d.lines.filter(x => keywordRe.test(x) || hasToday(x) || hasCurrentWeek(x));
    console.log(hits.slice(0, 220).join('\n'));
  }
}

fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 2));
await browser.close();

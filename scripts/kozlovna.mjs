import { chromium } from 'playwright';
import fs from 'node:fs';

const url = 'https://kozlovnakosice.sk/#obedove-menu';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'sk-SK',
  timezoneId: 'Europe/Bratislava',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36'
});

await context.route('**/*', async route => {
  const headers = { ...route.request().headers(), 'cache-control': 'no-cache', pragma: 'no-cache' };
  await route.continue({ headers });
});

const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(3000);

const bodyText = await page.locator('body').innerText();
const html = await page.content();
const title = await page.title();

const today = new Intl.DateTimeFormat('sk-SK', {
  timeZone: 'Europe/Bratislava',
  day: 'numeric', month: 'numeric', year: 'numeric'
}).format(new Date()).replaceAll(' ', '');

const variants = new Set([
  today,
  today.replace(/\.$/, ''),
  today.replaceAll(' ', ''),
  today.replace(/\./g, '. ')
]);

const hasToday = [...variants].some(v => bodyText.replaceAll(' ', '').includes(v.replaceAll(' ', '')));

const lines = bodyText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const dateRe = /\b(?:0?[1-9]|[12]\d|3[01])\.\s*(?:0?[1-9]|1[0-2])\.\s*20\d{2}\b/;
const moneyRe = /\b\d+[,.]\d{2}\s*€/;

let targetIndex = lines.findIndex(l => l.replaceAll(' ', '').includes(today.replaceAll(' ', '')));
if (targetIndex < 0) targetIndex = lines.findIndex(l => dateRe.test(l));

let menuBlock = [];
if (targetIndex >= 0) {
  const start = Math.max(0, targetIndex - 3);
  let end = Math.min(lines.length, targetIndex + 120);
  for (let i = targetIndex + 1; i < end; i++) {
    if (dateRe.test(lines[i]) && !lines[i].replaceAll(' ', '').includes(today.replaceAll(' ', ''))) {
      end = i;
      break;
    }
  }
  menuBlock = lines.slice(start, end);
}

const prices = menuBlock.filter(l => moneyRe.test(l));

fs.mkdirSync('output', { recursive: true });
fs.writeFileSync('output/kozlovna-body.txt', bodyText);
fs.writeFileSync('output/kozlovna.html', html);
fs.writeFileSync('output/kozlovna.json', JSON.stringify({
  fetchedAt: new Date().toISOString(),
  url,
  title,
  today,
  hasToday,
  targetIndex,
  menuBlock,
  prices
}, null, 2));

console.log(JSON.stringify({ title, today, hasToday, targetIndex, menuBlock, prices }, null, 2));
await browser.close();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMenu, euro, displayDate, weekday, sha256 } from './lib/menu-contract.mjs';

export const TEMPLATE_VERSION = 'kosice-lunch-email-v1';
const template = fs.readFileSync(new URL('../templates/email-v1.html', import.meta.url), 'utf8');
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const accents = { kozlovna: '#8a6f3d', 'cool-bowling': '#407a88', tahiti: '#39846f', bluebell: '#ac822c', 'stara-sypka': '#99685a' };
const icons = { kozlovna: '🍽️', 'cool-bowling': '🎳', tahiti: '🌴', bluebell: '🍺', 'stara-sypka': '🏡' };
const labels = { biznis: 'BIZNIS MENU', tradicne: 'TRADIČNÉ MENU', veggie: 'VEGGIE MENU', 'special-1': 'ŠPECIÁL MENU 1', 'special-2': 'ŠPECIÁL MENU 2' };
function itemRow(item, soup = false) {
  const price = euro(item.finalCents);
  const original = item.finalCents !== item.priceCents ? `<div style="color:#888;font-size:12px;text-decoration:line-through;margin-bottom:4px;">${euro(item.priceCents)}</div>` : '';
  const label = labels[item.category] ? `<div style="font-size:10px;font-weight:700;color:#8a6f3d;margin-bottom:4px;">${labels[item.category]}</div>` : '';
  return `<tr><td style="font-size:14px;line-height:1.5;padding:10px 10px 10px 0;border-bottom:1px solid #eee7de;">${label}${escape(item.name)}</td><td align="right" valign="middle" style="width:94px;white-space:nowrap;padding:10px 0;border-bottom:1px solid #eee7de;">${original}<span style="display:inline-block;padding:6px 9px;border-radius:14px;background:${soup ? '#ece6dc' : '#f1ece3'};color:#252525;font-size:13px;font-weight:700;">${price}</span></td></tr>`;
}
function card(r) {
  const badge = r.id === 'bluebell' ? 'TÝŽDENNÉ MENU' : 'DENNÉ MENU';
  const content = r.closed ? '<div style="font-size:14px;line-height:1.6;color:#666;">Pondelok – zatvorené.</div>' :
    `${r.id === 'bluebell' ? `<div style="font-size:12px;color:#8b7328;margin-bottom:14px;">${displayDate(r.source.validFrom)} – ${displayDate(r.source.validTo)} · 11:00–14:00</div>` : ''}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f4ef;border-radius:12px;"><tr><td style="padding:12px 14px;"><div style="font-size:12px;font-weight:700;margin-bottom:3px;">🥣 POLIEVKY</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${r.soups.map(i => itemRow(i, true)).join('')}</table></td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;">${r.mains.map(i => itemRow(i)).join('')}</table>`;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:18px;border:1px solid #e9e2d8;border-radius:16px;"><tr><td style="padding:20px 16px;border-left:4px solid ${accents[r.id]};"><div style="font-size:10px;letter-spacing:1.8px;color:${accents[r.id]};font-weight:700;">${badge}</div><div style="font-size:22px;line-height:1.25;font-weight:800;margin:6px 0 14px;">${icons[r.id]} ${escape(r.name)}</div>${content}</td></tr></table>`;
}
function verdict(menu) {
  const all = menu.restaurants.flatMap(r => r.mains.map(i => ({ ...i, restaurant: r.name, restaurantId: r.id })));
  const sorted = [...all].sort((a, b) => a.finalCents - b.finalCents); // stable ties preserve published order
  const cheapest = sorted[0];
  const discounted = all.filter(i => i.priceCents > i.finalCents).sort((a, b) => (b.priceCents - b.finalCents) - (a.priceCents - a.finalCents))[0];
  const tip = all.find(i => i.restaurantId === 'bluebell' && i.category === 'biznis') || cheapest;
  return [
    ['💶 NAJLACNEJŠIE', cheapest, 'Najnižšia cena hlavného jedla'],
    ['⭐ BEST VALUE', discounted || cheapest, discounted ? `Úspora ${euro(discounted.priceCents - discounted.finalCents)} oproti pôvodnej cene` : 'Výber podľa ceny hlavného jedla'],
    ['🍴 TIP DŇA', tip, tip.category === 'biznis' ? 'Z publikovanej ponuky biznis menu' : 'Výber z dnešnej ponuky']
  ];
}
export function renderEmail(input, options = {}) {
  const menu = validateMenu(input, options);
  const verdictRows = verdict(menu);
  const menuDigest = sha256(JSON.stringify(menu));
  const marker = `<!-- ${TEMPLATE_VERSION};date=${menu.date};sha256=${menuDigest} -->`;
  const values = { DAY: ['NEDEĽA', 'PONDELOK', 'UTOROK', 'STREDA', 'ŠTVRTOK', 'PIATOK', 'SOBOTA'][weekday(menu.date)], DATE: displayDate(menu.date), RESTAURANTS: menu.restaurants.map(card).join('\n'), VERDICT: verdictRows.map(([label, i, why]) => `<div style="padding:12px 0;border-top:1px solid #3e3b35;"><div style="font-size:11px;letter-spacing:0.7px;color:#d5bc89;font-weight:700;">${label}</div><div style="font-size:14px;line-height:1.5;margin-top:5px;"><b>${escape(i.restaurant)} · ${euro(i.finalCents)}</b><br>${escape(i.name)}</div><div style="font-size:12px;line-height:1.5;color:#c7c7c7;margin-top:4px;">${escape(why)}</div></div>`).join(''), VALIDATION_MARKER: marker };
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key]);
  if (/\{\{|<script|<img|<link|<iframe/i.test(html)) throw Error('Invalid fixed template output');
  const subject = `Obedové menu – Košice | ${displayDate(menu.date)}`;
  const plain = [subject, ...menu.restaurants.map(r => r.closed ? `${r.name}\nPondelok – zatvorené.` : `${r.name}${r.id === 'bluebell' ? `\n${displayDate(r.source.validFrom)} – ${displayDate(r.source.validTo)}` : ''}\nPolievky:\n${r.soups.map(i => `${i.name} — ${euro(i.finalCents)}`).join('\n')}\nHlavné jedlá:\n${r.mains.map(i => `${labels[i.category] ? labels[i.category] + ': ' : ''}${i.name} — ${i.priceCents !== i.finalCents ? euro(i.priceCents) + ' → ' : ''}${euro(i.finalCents)}`).join('\n')}`), 'DNEŠNÝ VERDIKT', ...verdictRows.map(([label, i, why]) => `${label}: ${i.restaurant} — ${i.name} — ${euro(i.finalCents)} (${why})`), 'Dobrú chuť!'].join('\n\n');
  return { subject, html, plain, templateVersion: TEMPLATE_VERSION, menuDigest, date: menu.date };
}
export function validateBody(message, input, options = {}) {
  const expected = renderEmail(input, options);
  for (const key of ['subject', 'html', 'plain']) if (message[key] !== expected[key]) throw Error(`Outgoing ${key} differs from validated renderer output`);
  return true;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [inputPath, out = 'output/email'] = process.argv.slice(2);
  if (!inputPath) throw Error('Usage: node scripts/render-email.mjs normalized-menu.json [output-directory]');
  // Remove old deliverables before validation, so failure cannot leave yesterday's email sendable.
  fs.mkdirSync(out, { recursive: true });
  for (const file of ['email.html', 'email.txt', 'email.json']) fs.rmSync(path.join(out, file), { force: true });
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const result = renderEmail(input);
  validateBody(result, input);
  fs.writeFileSync(path.join(out, 'email.html'), result.html);
  fs.writeFileSync(path.join(out, 'email.txt'), result.plain);
  fs.writeFileSync(path.join(out, 'email.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ subject: result.subject, templateVersion: result.templateVersion, menuDigest: result.menuDigest }));
}

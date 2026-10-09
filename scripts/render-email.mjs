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
const displayName = item => [item.name, item.description, item.portion].filter(Boolean).join(' · ');
// Original short messages, not attributed quotations. Retries use the same date-based choice.
const dailyThoughts = [
  'Nemusíš zvládnuť všetko naraz. Aj jeden malý krok správnym smerom sa počíta.',
  'Začni tým, čo vieš ovplyvniť. Aj malá zmena vie spríjemniť deň.',
  'Prestávka nie je strata času. Dáva ti priestor pokračovať s čistejšou hlavou.',
  'Nie každý výsledok je hneď viditeľný. Aj pokojná, poctivá práca má svoju hodnotu.',
  'Dnes nemusí byť všetko dokonalé. Stačí, ak bude niečo o kúsok lepšie.',
  'Daj si dobrý obed a trochu nadhľadu. Aj popoludnie môže priniesť príjemné prekvapenie.',
  'Malý úspech si zaslúži pozornosť rovnako ako veľký plán.',
  'Ak sa niečo nepodarilo, nemusíš tým označiť celý deň. Ešte zostáva priestor na niečo dobré.',
  'Niekedy je najlepší ďalší krok ten najjednoduchší. Vyber si jednu vec a začni.',
  'Dopraj si rovnakú trpezlivosť, akú vieš dopriať druhým.',
  'Aj v obyčajnom dni sa dá nájsť chvíľa, ktorá stojí za úsmev.',
  'Nemusíš sa ponáhľať s každou odpoveďou. Trochu pokoja môže pomôcť nájsť tú správnu.',
  'Pokrok nemusí byť hlučný. Niekedy vyzerá len ako pokojne dokončená úloha.',
  'Jedna úprimná pochvala môže niekomu spríjemniť deň. Možno ju dnes môžeš vysloviť práve ty.',
  'Aj veľký plán sa dá rozdeliť na malé kroky. Ten najbližší máš pred sebou.',
  'Nezabudni si všimnúť, čo už funguje. Aj na tom môžeš postaviť ďalší krok.',
  'Dobrý nápad niekedy príde až vtedy, keď si na chvíľu vydýchneš.',
  'Tvoj deň nemusí vyzerať ako deň niekoho iného. Nájdeš v ňom vlastné tempo.',
  'Aj krátke poďakovanie má svoju váhu. Dnes môže byť tou najjednoduchšou dobrou vecou.',
  'Nie je potrebné vyhrať nad celým zoznamom úloh. Vyber si tú, na ktorej teraz záleží.',
  'Odvaha môže vyzerať aj nenápadne: položiť otázku, skúsiť to znova alebo požiadať o pomoc.',
  'Nechaj si v dni miesto aj na niečo príjemné. Nemusí to byť nič veľké.',
  'To, že sa ešte učíš, neznamená, že stojíš na mieste.',
  'Dobrá nálada sa nedá prikázať. Malú príjemnú chvíľu si však môžeš dopriať.',
  'Keď sa plán zmení, môžeš zmeniť aj ďalší krok. Nemusíš sa vzdať celého smeru.',
  'Všímaj si malé veci, ktoré ti robia dobre. Aj tie patria do vydareného dňa.',
  'Niektoré veci potrebujú čas. Dnešná snaha môže byť ich nenápadným začiatkom.',
  'Porovnaj sa na chvíľu so svojím včerajškom. Možno si sa posunul viac, než si myslíš.',
  'Láskavosť nemusí stáť veľa času. Niekedy stačí pozorné počúvanie.',
  'Obed je dobrá chvíľa na krátky reset. Popoludnie môžeš začať jednou jasnou prioritou.',
  'Nemusíš mať pripravenú celú cestu. Na začiatok stačí vedieť, kam položíš ďalší krok.',
  'Vlastný úspech nemusíš zmenšovať len preto, že bol pre niekoho iného jednoduchý.',
  'Aj pokojné nie môže vytvoriť priestor pre dôležité áno.',
  'Ak dnes ideš pomalšie, stále sa môžeš posúvať. Tempo a smer sú dve rôzne veci.',
  'Nie všetko musí zostať na tvojich pleciach. Dobrá spolupráca začína aj rozdelením úloh.',
  'Urob jednu vec s plnou pozornosťou. Niekedy je to príjemnejšie než skúšať všetko naraz.',
  'Každý deň nemusí priniesť veľký príbeh. Aj malá spokojnosť stojí za to.',
  'Daj svojim nápadom šancu aj v nedokonalej podobe. Dopracovať ich môžeš postupne.',
  'Zastav sa pri tom, čo sa dnes podarilo. Aj drobnosť si zaslúži uznanie.',
  'Niektoré dobré rozhodnutia sú celkom obyčajné: najesť sa v pokoji, poďakovať a na chvíľu spomaliť.',
  'Otázka nie je známkou slabosti. Môže byť začiatkom lepšieho porozumenia.',
  'To, čo dnes dokončíš, môže zajtrajšok trochu uľahčiť. Aj malá úloha má svoj zmysel.',
  'Nemusíš pokračovať presne tak, ako si začal. Skúsenosť ti môže ukázať lepšiu cestu.',
  'Dobrý deň môže obsahovať aj náročnú chvíľu. Jedno nevylučuje druhé.',
  'Venuj chvíľu človeku pred sebou. Obyčajný rozhovor môže byť najpríjemnejšou časťou dňa.',
  'Keď nevieš, kde začať, skús si pomenovať najbližší malý krok.',
  'Aj tvoja vlastná spokojnosť má miesto v pláne dňa.',
  'Z dokončenej drobnosti môže prísť chuť pokračovať. Netreba začínať tým najväčším.',
  'Nemusíš mať vždy posledné slovo. Niekedy viac prinesie dobrá otázka.',
  'Učenie sa skladá aj z pokusov, ktoré nevyšli. Môžeš si z nich vziať niečo užitočné.',
  'Keď je deň plný, vyber si jednu chvíľu, v ktorej sa nebudeš ponáhľať.',
  'Rozumný cieľ nemusí byť malý. Len ti necháva priestor postupovať po častiach.',
  'Povedz dnes niekomu, čo si na jeho práci vážiš. Konkrétne slová potešia viac než všeobecné.',
  'Dobrý obed nevyrieši všetko. Môže však byť príjemným začiatkom lepšieho popoludnia.',
  'Aj cesta, ktorú už poznáš, môže ponúknuť nový nápad. Stačí sa na chvíľu pozrieť inak.',
  'To, čo nemusíš vyriešiť dnes, nemusí zabrať celé dnešné premýšľanie.',
  'Ak si niečím neistý, môžeš začať malým pokusom. Aj ten ti dá novú skúsenosť.',
  'Niekedy má najväčší zmysel dokončiť to, čo je takmer hotové.',
  'V práci aj mimo nej si všimni ľudí, s ktorými je deň príjemnejší.',
  'Na konci dňa môže potešiť aj jednoduchá vec: niečo si dokončil, niekomu pomohol alebo si sa niečo naučil.'
];
const workdayNumber = date => {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000) + 3; // Monday-aligned calendar weeks.
  if (!Number.isFinite(day)) throw Error('Invalid daily thought date');
  const week = Math.floor(day / 7);
  return week * 5 + Math.min(day - week * 7, 5);
};
export function dailyThought(date) {
  const offset = workdayNumber(date) - workdayNumber('2026-10-09');
  return dailyThoughts[((offset % dailyThoughts.length) + dailyThoughts.length) % dailyThoughts.length];
}
function itemRow(item, soup = false) {
  const price = euro(item.finalCents);
  const original = item.finalCents !== item.priceCents ? `<div style="color:#888;font-size:12px;white-space:nowrap;text-decoration:line-through;margin-bottom:4px;">${euro(item.priceCents)}</div>` : '';
  const label = labels[item.category] ? `<div style="font-size:10px;font-weight:700;color:#8a6f3d;margin-bottom:4px;">${labels[item.category]}</div>` : '';
  return `<tr><td class="item-name" valign="top" style="font-size:15px;line-height:1.55;overflow-wrap:anywhere;word-wrap:break-word;padding:12px 10px;border-bottom:1px solid #eee7de;">${label}${escape(displayName(item))}&nbsp;</td><td class="item-price" width="94" align="right" valign="top" style="width:94px;box-sizing:border-box;white-space:nowrap;font-variant-numeric:tabular-nums;padding:12px 10px 12px 8px;border-bottom:1px solid #eee7de;">${original}<span style="display:inline-block;white-space:nowrap;padding:6px 8px;border-radius:14px;background:${soup ? '#ece6dc' : '#f1ece3'};color:#252525;font-size:14px;font-weight:700;">${price}</span></td></tr>`;
}
const itemTable = (items, soup = false, style = '') => `<table class="food-table" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;border-collapse:collapse;${style}">${items.map(i => itemRow(i, soup)).join('')}</table>`;
function card(r) {
  const badge = r.id === 'bluebell' || r.source?.scope?.startsWith('weekly') ? 'TÝŽDENNÉ MENU' : 'DENNÉ MENU';
  const extras = r.closed ? '' : `${r.desserts.length ? `<div style="font-size:12px;font-weight:700;margin-top:16px;">DEZERTY</div>${itemTable(r.desserts)}` : ''}${r.notes.map(n => `<div style="font-size:12px;line-height:1.5;overflow-wrap:anywhere;word-wrap:break-word;color:#666;margin-top:12px;">${escape(n)}</div>`).join('')}`;
  const content = r.closed ? '<div style="font-size:14px;line-height:1.6;color:#666;">Pondelok – zatvorené.</div>' :
    `${r.id === 'bluebell' ? `<div style="font-size:12px;color:#8b7328;margin-bottom:14px;">${displayDate(r.source.validFrom)} – ${displayDate(r.source.validTo)} · 11:00–14:00</div>` : ''}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;background:#f7f4ef;border-radius:12px;"><tr><td style="padding:12px 0;"><div style="font-size:12px;font-weight:700;padding:0 10px;margin-bottom:3px;">🥣 POLIEVKY</div>${itemTable(r.soups, true)}</td></tr></table>${itemTable(r.mains, false, 'margin-top:8px;')}`;
  return `<table class="restaurant-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;margin-bottom:18px;border:1px solid #e9e2d8;border-radius:16px;"><tr><td class="restaurant-content" style="padding:20px 16px;border-left:4px solid ${accents[r.id]};"><div style="font-size:10px;letter-spacing:1.8px;color:${accents[r.id]};font-weight:700;">${badge}</div><div class="restaurant-name" style="font-size:22px;line-height:1.25;overflow-wrap:anywhere;word-wrap:break-word;font-weight:800;margin:6px 0 14px;">${icons[r.id]} ${escape(r.name)}</div>${content}${extras}</td></tr></table>`;
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
  const thought = dailyThought(menu.date);
  const verdictRows = verdict(menu);
  const menuDigest = sha256(JSON.stringify(menu));
  const marker = `<!-- ${TEMPLATE_VERSION};date=${menu.date};sha256=${menuDigest} -->`;
  const values = { DAY: ['NEDEĽA', 'PONDELOK', 'UTOROK', 'STREDA', 'ŠTVRTOK', 'PIATOK', 'SOBOTA'][weekday(menu.date)], DATE: displayDate(menu.date), RESTAURANTS: menu.restaurants.map(card).join('\n'), VERDICT: verdictRows.map(([label, i, why]) => `<div style="padding:12px 0;border-top:1px solid #3e3b35;"><div style="font-size:11px;letter-spacing:0.7px;color:#d5bc89;font-weight:700;">${label}</div><div style="font-size:14px;line-height:1.5;margin-top:5px;"><b>${escape(i.restaurant)} · ${euro(i.finalCents)}</b><br>${escape(displayName(i))}</div><div style="font-size:12px;line-height:1.5;color:#c7c7c7;margin-top:4px;">${escape(why)}</div></div>`).join(''), VALIDATION_MARKER: marker };
  values.DAILY_THOUGHT = escape(thought);
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key]);
  if (/\{\{|<script|<img|<link|<iframe/i.test(html)) throw Error('Invalid fixed template output');
  const subject = `Obedové menu – Košice | ${displayDate(menu.date)}`;
  const plain = [subject, ...menu.restaurants.map(r => r.closed ? `${r.name}\nPondelok – zatvorené.` : `${r.name}${r.id === 'bluebell' ? `\n${displayDate(r.source.validFrom)} – ${displayDate(r.source.validTo)}` : ''}\nPolievky:\n${r.soups.map(i => `${displayName(i)} — ${euro(i.finalCents)}`).join('\n')}\nHlavné jedlá:\n${r.mains.map(i => `${labels[i.category] ? labels[i.category] + ': ' : ''}${displayName(i)} — ${i.priceCents !== i.finalCents ? euro(i.priceCents) + ' → ' : ''}${euro(i.finalCents)}`).join('\n')}${r.desserts.length ? `\nDezerty:\n${r.desserts.map(i => `${displayName(i)} — ${euro(i.finalCents)}`).join('\n')}` : ''}${r.notes.length ? '\n' + r.notes.join('\n') : ''}`), 'DNEŠNÝ VERDIKT', ...verdictRows.map(([label, i, why]) => `${label}: ${i.restaurant} — ${displayName(i)} — ${euro(i.finalCents)} (${why})`), 'Dobrú chuť!'].join('\n\n');
  return { subject, html, plain: `${plain}\n\n💡 MYŠLIENKA NA DNES\n${thought}`, templateVersion: TEMPLATE_VERSION, menuDigest, date: menu.date };
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

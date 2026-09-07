# Obedové menu: jednotné pravidlá v1

Tieto pravidlá a renderer používajú všetky tri existujúce ranné pokusy. Zber dát v GitHub Actions neposiela e-mail. E-mail posiela existujúca automatizácia cez Gmail až po úspešnej validácii. Nikdy znovu nenavrhuj HTML podľa slovného opisu.

## Postup jedného pokusu

1. Vypočítaj dnešný dátum v `Europe/Bratislava`. Over slovenský pracovný deň podľa aktuálne platného kalendára dní pracovného pokoja. Samotný názov štátneho sviatku nestačí. Cez víkend alebo deň pracovného pokoja nič neposielaj.
2. Vyhľadaj v Gmail Sent presný predmet a príjemcu určeného existujúcou automatizáciou. Načítaj telo kandidátov. Korektný dnešný kompletný e-mail znamená STOP. Statusový, neúplný alebo preukázateľne starý obsah sa nepovažuje za úspešný obedový e-mail. Gmail vyhľadávanie predmetu je len vyhľadanie kandidátov; hlavičky over presnou zhodou.
3. Zisti aktuálny commit `main` a potrebné súbory čítaj z toho istého commitu. Načítaj najprv malé JSON prehľady. `capturedAt`/`generatedAt` je čas zberu, `today`, `hasToday`, `hasCurrentWeek` a `blueBellAccepted` zo starších scraperov nie sú dôkaz platnosti jedál. Dátum musí pochádzať zo samotného menu a byť viazaný na tie isté položky.
4. Bežné denné zachytenia musia byť z dnešného bratislavského dňa. Pri starom/neúplnom zdroji obnov iba dotknutý podnik cez jeho aktuálnu stránku. Nespúšťaj znovu všetky zdroje. Nedoplňuj dnešné jedlá zo včerajšieho e-mailu, minulého chatu, vyhľadávacieho úryvku ani z dátumu v dopyte.
5. Zostav normalizovaný JSON podľa kontraktu nižšie. Skontroluj všetky publikované polievky, hlavné jedlá, prílohy, denné aj týždenné špeciály a ceny. `reviewedComplete=true` nastav až po porovnaní s celou relevantnou ponukou. Nevymýšľaj obsah položky označenej iba „podľa dennej ponuky“.
6. Pondelok vyžaduje Kozlovňu, Cool Bowling, Tahiti a Piváreň BlueBell. Stará Sýpka má stále vlastnú kartu „Pondelok – zatvorené“. Utorok–piatok je povinných všetkých päť podnikov. Žiadna výnimka 4/5, ani v poslednom pokuse. Ak chýba povinná položka, dôveryhodný dátum alebo cena, nič neposielaj; dôvod ponechaj len v zázname behu.
7. Načítaj a spusti `scripts/render-email.mjs`, `scripts/lib/menu-contract.mjs` a `templates/email-v1.html` z rovnakého commitu. Node 22+, bez inštalácie závislostí: `node scripts/render-email.mjs normalized-menu.json output/email`. Ak runtime nevie spustiť renderer alebo získať šablónu, STOP; nenahrádzaj ho vlastným HTML. Neobchádzaj chybu validátora úpravou zdrojového dôkazu, dátumu alebo prázdnou cenou.
8. Použi presne vygenerované `subject`, `html` a `plain` z nového `output/email/email.json`. Renderer kontroluje povinné podniky, väzbu každého jedla/ceny na zdroj, dáta BlueBell a vypočíta 15 % zľavu Tahiti výhradne na hlavné jedlá. Cena polievky ostáva publikovaná. Layout, text podnadpisu, farby, poradie, cenovky, verdict a footer sú pevné. Žiadne kreatívne preformátovanie, skracovanie príloh, zmeny cien alebo ručný prepis HTML po renderovaní.
9. Tesne pred odoslaním zopakuj Gmail Sent kontrolu presného príjemcu, predmetu a tela. Znovu potvrď, že bratislavský dátum sa nezmenil. Do existujúceho Gmail odoslania vlož presné výstupy rendereru; žiadne nové CC/BCC. Výsledok obsahuje verziu šablóny a hash menu, nikdy však súkromnú adresu v repozitári.
10. Načítaj odoslanú kópiu, dekóduj MIME a over prítomnosť všetkých konkrétnych jedál/cien a rovnakú platnosť BlueBell. Označ úspech až potom. Pri nejasnom výsledku odoslania najprv vyhľadaj Sent, neposielaj naslepo znova. Zdroje a technické poznámky sú v podkladoch, nie v zákazníckom tele e-mailu.

## BlueBell: samostatné obrázky

- Identita: iba Piváreň BlueBell, Hlavná 22, Košice, `pivarenbluebell.sk`, Facebook `pivarenbluebell`. Nezamieňaj s bistrom/kaviarňou.
- Primárne `results/bluebell-hires/selection.json`, potom jednotlivé fotky a ich OCR. `metadata.json` obsahuje identitu stránky, permalink, čas získania a SHA-256 obrázka. Zoznam výsledkov či galéria nemajú chronologickú záruku.
- `unavailable` alebo `conflicting_current_images` nie je platné menu. Pri konflikte otvor konkrétne aktuálne obrázky; novšiu verziu vyber len s overeným poradím publikácie/opravy. Bez rozlíšenia konfliktu STOP.
- `reviewCandidates` označuje konkrétne stiahnuté menu obrázky s nejasným OCR. Otvor príslušný obrázok a vizuálne over celý dátum, položky aj ceny; tento zoznam sám nepotvrdzuje aktuálnosť ani úplnosť a nie je podklad na automatický send.
- Z obrazu jednej konkrétnej fotky prečítaj hlavičku **od–do vrátane roka**, všetkých päť kategórií jedál a ich ceny. Dátum popisu príspevku, webu alebo zachytenia nesmie nahradiť dátum na obrázku. Starý obrázok s novým popisom odmietni.
- Čítaj originálny obrázok/fotoprehliadač; OCR malej miniatúry ani slepený `ocr-all.txt` nie sú finálny zdroj. OCR je `slk+eng`; režimy 6/11 sa posudzujú oddelene. `needsVisualReview=true` vyžaduje vizuálnu kontrolu obrázka a opravu OCR prepisu podľa skutočných pixelov. Nečitateľné jedlo/cenu nedopočítavaj.
- Overený prepis používateľom dodaného obrázka je v `data/bluebell/2026-09-07.json`, **iba na 7.–11. 9. 2026**. Jeho URL označuje podnik, nie overený permalink konkrétneho postu. Tento podklad je záloha pre daný týždeň; nie tvrdenie o dnešnom živom stiahnutí. Ak je dostupná novšia overená oprava na oficiálnej stránke, over konflikt a použi ju. Platnosť JSON nikdy nepredlžuj.
- Nové overené obrázky smú byť dočasne používané v rámci dátumu na obrázku. Po skončení týždňa sa cache nepoužije. Dôkaz uchovaj spolu s položkami; každý ďalší pokus musí znovu vyhodnotiť platnosť voči dnešku.

## Ostatné zdroje

| ID | Primárny zdroj | Pravidlo |
| --- | --- | --- |
| `kozlovna` | https://kozlovnakosice.sk/#obedove-menu | Dnešná sekcia + kompletné jedlá, prílohy, ceny. |
| `cool-bowling` | https://www.coolbowling.sk/denne-menu | Dnešná sekcia vrátane všetkých publikovaných špeciálov. |
| `tahiti` | https://www.tahitirestaurant.sk/tyzdenne-menu | Aktuálny explicitný týždeň: spoločné týždenné menu alebo izolovaná dnešná sekcia; fallback https://menu.andiamogroup.eu/chickin/denne-menu. Pri konflikte rozhoduje novší potvrdený zdroj, nie cache. |
| `stara-sypka` | https://www.starasypka.sk/sk/restauracia/obedove-menu | Utorok–piatok dnešný dátum; staré či nejasne datované PDF odmietni. |

## Normalizovaný kontrakt

Vrchná úroveň: `{ "date": "YYYY-MM-DD", "restaurants": [...] }`.
Podnik: `{ "id": "kozlovna", "reviewedComplete": true, "source": {...}, "soups": [...], "mains": [...] }`.
Voliteľné `desserts` obsahuje publikované dezerty; nezapočítavajú sa do najlacnejšieho hlavného jedla ani zľavy Tahiti. Voliteľné `notes` sú doslovné podmienky cien z toho istého dokumentu.
Každá položka: `name` (úplný prepis názvu), voliteľné `description` (prílohy, ak sú v zdroji oddelené cenou/alergénmi) a `portion` (gramáž/objem); každá hodnota musí byť doložená v rovnakom `sourceText`, `price` (pôvodná publikovaná cena, číselne EUR), `sourceText` (doslovný úsek toho istého menu zahŕňajúci názov a jeho cenu s €). Zľavnenú cenu nedodávaj; počíta ju renderer.

Bežný `source`: `kind: "html"`, `url` (oficiálny zdroj), `capturedAt` (skutočný ISO čas zberu), `text` (relevantný dokument), `dateText` (doslovný dátum v dokumente), `sectionText` (izolovaná dnešná sekcia vrátane hlavičky), `serviceDate: "YYYY-MM-DD"`. Dnešná sekcia nesmie obsahovať položky iných dní. Pri Tahiti s týždennou hlavičkou navyše `scope: "weekly"`, `dateText` s celým rozsahom a `dayText` s doslovným názvom dnešného dňa v `sectionText` alebo jeho dátumom. Oficiálny HTML dátum `07.09.26` je prípustný len s vytlačeným rokom zhodným s dnešným rokom; `07.09-11.09.2026` používa vytlačený spoločný rok. Dátumy nikdy nedopisuj do citovaného textu. BlueBell naďalej vyžaduje oba plné roky z jedného obrázka.

Tahiti, ktoré publikuje jednu ponuku na celý týždeň bez denných hlavičiek: použi `scope: "weekly-shared"`, `dateText` ako celú doslovnú hlavičku „Týždenné menu … od–do“, `sectionText` ako celú spoločnú ponuku. Rozsah musí obsahovať dnešok a mať najviac sedem kalendárnych dní; iné dátumy alebo hlavičky jednotlivých dní sú zakázané. Nevymýšľaj pondelkovú hlavičku.

BlueBell `source`: `kind: "image-ocr"` alebo `"verified-image"`, `url`, `ownerUrl`, `identityText`, `capturedAt`, `imageSha256`, `text` (OCR/vizuálny prepis jedného celého menu), `dateText`, `validFrom`, `validTo`. Pri overenom prepise aj `verification: "visual-transcription"`; pôvod a skutočný čas overenia musia zostať zachované. Päť hlavných položiek má kategórie `biznis`, `tradicne`, `veggie`, `special-1`, `special-2`.

Kompletný funkčný BlueBell príklad je v `data/bluebell/2026-09-07.json`. Testy používajú výslovne ukážkové jedlá pre ostatné podniky; nikdy ich nepouži v skutočnom e-maile.

## Prevádzka a overenie

- `node --test test/menu.test.mjs`: regresie starého obrázka, prepisovania dátumu, chýbajúcich cien, identity, pondelkovej výnimky, zľavy a presného HTML/plain výstupu.
- `npm run scrape:bluebell-hires`: obmedzený zber najviac 24 kandidátov, deduplikácia podľa photo ID a obsahu; skutočné CDN adresy bez prepisovania podpisov.
- `node scripts/bluebell-select.mjs output/bluebell-hires`: vytvorí čitateľný prehľad prijatých/odmietnutých obrázkov. Nepotvrdzuje automaticky bezchybný vizuálny prepis.
- Oneskorené GitHub cron behy už nevypadnú pre kontrolu aktuálnej hodiny 09. Oba UTC sloty sa použijú aj cez zmenu letného času. Starý screenshotový workflow zostáva na vyžiadanie; hi-res OCR je pravidelný primárny zber.
- GitHub cron negarantuje presný čas. Pri chýbajúcom rannom výstupe použije automatizácia živý fallback podľa rovnakých pravidiel. Výsledok `success` v Actions s preskočenými krokmi nie je čerstvý capture.
- Stabilita HTML je garantovaná rendererom pre tie isté dáta. Rôzni e-mailoví klienti môžu mierne odlišne vykresliť fonty/emoji/zaoblenie; formát sa však pri každom behu nevytvára nanovo.

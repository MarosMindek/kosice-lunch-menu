# Prevádzka obedového menu

Autoritatívna implementácia je teraz `scripts/lunch.mjs`, spúšťaná workflow `.github/workflows/daily-lunch.yml`. Celý zber, parsovanie, kontrola, renderovanie aj odoslanie sú kód; model nemá pripravovať normalizovaný JSON, vyberať jedlá, posudzovať OCR ani ručne odosielať Gmail správu.

- Bežné spustenie: `npm run lunch:send`.
- Živý test bez odoslania: `npm run lunch:dry-run`.
- Výstup: `output/autonomous/status.json` a presná šablóna v `output/autonomous/email.html`.
- Jednorazové pripojenie Gmailu a podrobná prevádzka: [AUTONOMOUS.md](AUTONOMOUS.md).

## STRICT aktuálnosť zdrojov pri manuálnom retry

Pri manuálnom retry alebo diagnostike sa výsledok vyhľadávača, indexovaný snippet, cache náhľad ani agregátor **nikdy nepovažuje za dôkaz aktuálnosti menu**. Vyhľadávač možno použiť iba na nájdenie oficiálnej URL. Potom sa musí otvoriť priamo originálny zdroj a dátum/týždeň, jedlá aj ceny sa musia potvrdiť z obsahu tej istej oficiálnej stránky, PDF alebo overeného obrázka.

Ak priamy zdroj nemožno načítať, jeho obsah neobsahuje dnešný dátum/aktuálny týždeň alebo je dostupný iba starý indexovaný snippet, výsledok je **STOP**. Zakázané je odvodiť aktuálnosť zo search snippetu, dátumu indexácie, dátumu príspevku, capture timestampu alebo zo staršieho snapshotu.

Pre Tahiti sa pri retry otvára priamo aktuálna weekly page na `menu.andiamogroup.eu`; pre Kozlovňu a Cool Bowling priamo ich oficiálne menu sekcie; Stará Sýpka landing + aktuálny odkaz `ZOBRAZIŤ / VYTLAČIŤ`; BlueBell iba aktuálny validovaný interval alebo live verified-image s potvrdenou identitou Piváreň BlueBell/Blue Bell Pub. Search výsledok je len navigácia, nikdy obsahový zdroj.

Ak používateľ požiada o manuálne spustenie, spusti existujúci workflow alebo tento príkaz a oznám jeho skutočný výsledok. Nenahrádzaj chýbajúce poverenie, neúspešný parser alebo chybu odoslania vlastným generovaním e-mailu. Stará trojica modelových ranných úloh sa už na prevádzku nepoužíva.

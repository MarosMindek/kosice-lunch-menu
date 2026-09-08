# Prevádzka obedového menu

Autoritatívna implementácia je teraz `scripts/lunch.mjs`, spúšťaná workflow `.github/workflows/daily-lunch.yml`. Celý zber, parsovanie, kontrola, renderovanie aj odoslanie sú kód; model nemá pripravovať normalizovaný JSON, vyberať jedlá, posudzovať OCR ani ručne odosielať Gmail správu.

- Bežné spustenie: `npm run lunch:send`.
- Živý test bez odoslania: `npm run lunch:dry-run`.
- Výstup: `output/autonomous/status.json` a presná šablóna v `output/autonomous/email.html`.
- Jednorazové pripojenie Gmailu a podrobná prevádzka: [AUTONOMOUS.md](AUTONOMOUS.md).

Ak používateľ požiada o manuálne spustenie, spusti existujúci workflow alebo tento príkaz a oznám jeho skutočný výsledok. Nenahrádzaj chýbajúce poverenie, neúspešný parser alebo chybu odoslania vlastným generovaním e-mailu. Stará trojica modelových ranných úloh sa už na prevádzku nepoužíva.

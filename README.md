# Obedové menu – Košice

Automatické zbieranie denného menu, lokálne OCR obrázkov BlueBell, kontrola aktuálnosti a odosielanie cez Gmail API. Bežný beh nevolá generatívne modelové API a nespotrebúva LLM tokeny.

## Aktivácia

1. Jednorazovo pripoj Gmail podľa [návodu](docs/AUTONOMOUS.md#jednorazové-pripojenie-gmailu) a nastav GitHub Actions secret `GMAIL_OAUTH_JSON`.
2. Spusti [Autonomous lunch email](https://github.com/MarosMindek/kosice-lunch-menu/actions/workflows/daily-lunch.yml) cez **Run workflow → send**.
3. Ďalšie pracovné dni bežia automaticky o **09:30 Europe/Bratislava**, s ďalšími pokusmi o 09:45 a 10:00. Po overenom odoslaní ďalší pokus skončí bez opakovaného zbierania.

Bez Gmail secretu sa dajú spúšťať živé náhľady; automatické odosielanie ho vyžaduje.

## Príkazy

```sh
npm run lunch:dry-run  # stiahne a overí menu, uloží presný náhľad
npm run lunch:send     # vykoná celý proces vrátane kontrolovaného odoslania
npm test              # regresné testy
```

Príkazy zberu vyžadujú Node 22+, Playwright Chromium, Poppler, Tesseract so slovenčinou a Python Pillow. Workflow závislosti nainštaluje sám.

HTML aj text vznikajú z jedného overeného menu cez pevnú šablónu `templates/email-v1.html`, chránenú kontrolným súčtom. Program overuje dátumy priamo v zdrojoch a neodošle neúplné ani neaktuálne menu. Pri zmene formátu zdrojovej stránky môže parser potrebovať údržbu.

Podrobnosti o OCR, ochrane pred duplicitou, rozvrhu a diagnostike sú v [prevádzkovom návode](docs/AUTONOMOUS.md).

# Obedové menu bez modelových volaní

Bežný beh používa Node.js, Playwright, lokálny Tesseract a Gmail API. Nevolá žiadny jazykový ani obrazový model a nepotrebuje ChatGPT úlohu, prompt, ručné skladanie JSON ani ručné odoslanie.

## Jeden príkaz

```sh
npm run lunch:send
```

Príkaz sám overí pracovný deň a Gmail Sent, stiahne oficiálne zdroje, vyberie dnešné sekcie, spracuje obrázky/PDF, skontroluje položky a ceny, vygeneruje pevnú šablónu a odošle ju. Úspech potvrdí až po porovnaní odoslanej MIME kópie s pôvodným HTML aj textom. Na živý test bez odoslania slúži `npm run lunch:dry-run`.

Výstupy sú v `output/autonomous/`: `status.json`, `sources.json`, `normalized-menu.json`, `email.json`, `email.html`, `email.txt`. Pred novým behom sa staré e-mailové výstupy odstránia. `status.json` uvádza `modelCalls: 0`; ide o počet modelových volaní tohto programu.

## Jednorazové pripojenie Gmailu

GitHub runner potrebuje vlastné oprávnenie na schránku. Pripojenie Gmailu v ChatGPT nie je prenosný prihlasovací údaj pre tento program. Kód nečíta ani neexportuje poverenia konektora.

1. V [Google Cloud Console](https://console.cloud.google.com/apis/library/gmail.googleapis.com) vytvor/vyber svoj projekt a zapni **Gmail API**. V Google Auth Platform nastav vlastnú aplikáciu a vytvor OAuth klienta typu **Desktop app**. Stiahni jeho klientsky JSON.
2. Pre trvalú prevádzku použi publikačný stav **In production**. Pri externom projekte v stave **Testing** majú refresh tokeny pre Gmail typicky platnosť len sedem dní. Ide o súkromné používanie vlastnej aplikácie; povoľ iba zamýšľanú schránku a požadované oprávnenia. [Google OAuth dokumentácia](https://developers.google.com/identity/protocols/oauth2#expiration).
3. Na vlastnom počítači s Node 22+ spusti v priečinku repozitára:

   ```sh
   node scripts/setup-gmail.mjs cesta/ku/client_secret.json odosielatel@example.com prijemca@example.com
   ```

   Prihlásenie prebehne priamo cez Google. Skript používa PKCE, náhodný `state` a callback len na `127.0.0.1`. Výsledok uloží do lokálneho `gmail-oauth.json` s právami 0600 a nevypíše tokeny. Rozsahy sú `gmail.send` a `gmail.readonly` na kontrolu Sent; nežiada mazanie pošty. [Google: OAuth pre desktopové aplikácie](https://developers.google.com/identity/protocols/oauth2/native-app).
4. V [GitHub Actions secrets](https://github.com/MarosMindek/kosice-lunch-menu/settings/secrets/actions) vytvor **GMAIL_OAUTH_JSON** s obsahom tohto súboru. Alternatíva cez GitHub CLI:

   ```sh
   gh secret set GMAIL_OAUTH_JSON --repo MarosMindek/kosice-lunch-menu < gmail-oauth.json
   ```

   Tento JSON obsahuje `client_id`, `client_secret`, `refresh_token`, `from` a `to`. Hodnoty sa nedávajú do repozitára ani do chatu. Klientsky JSON aj tokenový JSON sú v `.gitignore`.
5. Otvor [Autonomous lunch email](https://github.com/MarosMindek/kosice-lunch-menu/actions/workflows/daily-lunch.yml), zvoľ **Run workflow** a zapni **send**. Najprv prebehne overenie účtu a kompletného menu. Nasledujúce pracovné dni bežia automaticky.

`GITHUB_TOKEN` poskytne GitHub Actions automaticky; slúži na trvalý záznam odosielania. Pri spustení mimo Actions musí prostredie navyše obsahovať `GITHUB_REPOSITORY` a vlastný token s Contents read/write pre tento repozitár. Gmail refresh token program priebežne vymieňa za krátkodobý access token bez modelového volania.

## Rozvrh a formát

- Jediný prevádzkový workflow: `daily-lunch.yml`, pondelok–piatok **09:30, 09:45 a 10:00 Europe/Bratislava**. Časové pásmo rieši aj letný čas. GitHub môže plánovaný štart oneskoriť; nejde o garanciu doručenia presne na minútu. [GitHub: plánované workflow](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
- Druhý a tretí pokus skončia pred inštaláciou prehliadača, ak už existuje overený e-mail. Súbežné behy sa serializujú.
- `templates/email-v1.html` zostáva rovnaký. Jeho SHA-256 je uložené v `templates/email-v1.sha256`. Zmena šablóny bez výslovnej aktualizácie kontrolného súčtu zablokuje beh.
- Všetky konkrétne položky, prílohy a ceny ostávajú v HTML aj textovej alternatíve. Tahiti má 15 % zľavu len na hlavné jedlá. Dezerty sa neporovnávajú s hlavnými jedlami.
- Stará Sýpka je v pondelok zatvorená; utorok–piatok je povinná. Kalendár obsahuje Veľkú noc aj zákonné výnimky pre 8. máj a 15. september 2026. [Zákon 241/1993, účinné znenie](https://static.slov-lex.sk/static/SK/ZZ/1993/241/20251101.html).

## BlueBell a zlyhania zdrojov

Program porovnáva viacero OCR čítaní jedného konkrétneho obrázka, podľa potreby aj zväčšenú verziu pôvodných pixelov. Na prijatie nového menu vyžaduje zhodu najmenej dvoch odlišných čítaní, minimálnu priemernú istotu 85 %, celý platný dátum, tri publikované polievkové položky a všetkých päť kategórií hlavných jedál. Po zhode dvoch pôvodných čítaní už obraz zbytočne netransformuje. Rozdielne kompletné aktuálne menu blokujú odoslanie. Dátum príspevku ani zachytenia nenahrádza dátum na obrázku.

OCR konsenzus je automatická kontrola, nie vyhlásenie o ľudskej vizuálnej kontrole. Chybu spoločnú viacerým OCR čítaniam nemožno úplne vylúčiť. Existujúci overený obrázok v `data/bluebell/2026-09-07.json` je len záloha na 7.–11. september 2026; jeho dátumy sa nepredlžujú. Po skončení platnosti musí prejsť nové OCR.

Ak sa zmení štruktúra stránky/PDF, chýba cena alebo obrázok nie je čitateľný, program skončí s chybou a plánovaný ďalší pokus zdroj obnoví. Neposiela čiastočné menu ani staré jedlá s novým dátumom. Diagnostika a presný náhľad sú v artefaktoch Actions; neobsahujú Gmail poverenia. Zmena zdroja môže vyžadovať údržbu parsera, bežné používanie model nevyžaduje.

## Ochrana pred duplicitou

Pred odoslaním sa do vetvy `lunch-delivery-state` atomicky zapíše zámer. Záznam obsahuje len dátum, nepriehľadný identifikátor a stav, bez adries a obsahu pošty. Pred každým pokusom sa navyše číta Gmail Sent a kontrolujú hlavičky a kontrolné súčty oboch MIME častí.

Gmail API neposkytuje transakciu spoločnú s GitHubom. Ak sa po požiadavke na odoslanie stratí spojenie, program neposiela naslepo znova. Nasledujúci beh hľadá potvrdenú kópiu v Sent. Ak ju nenájde a zostal zámer `sending`, skončí `UNCERTAIN_SEND`. Po jednoznačnom overení, že správa neodišla, možno daný jediný záznam úmyselne odstrániť a workflow zopakovať. Program stav nevymaže automaticky.

## Overenie

`npm test` kontroluje reálne formáty celého publikovaného týždňa, prílohy, dezerty, ceny, sviatky, expiráciu a konflikty OCR, presné MIME, opakovaný/súbežný beh, zmenu dátumu a trvalý záznam nejasného odoslania. Testy transportu používajú simulovanú schránku; skutočné odoslanie samostatným programom sa overí po pripojení Gmailu.

Push zmeny kódu na `main` vykoná celý živý test bez odoslania. Výsledok a verejné zdrojové údaje sa zapíšu aj do `results/autonomous/`. Samotný push nikdy neposiela e-mail. Staré jednotlivé zberové workflow ostávajú iba na výslovnú diagnostiku.

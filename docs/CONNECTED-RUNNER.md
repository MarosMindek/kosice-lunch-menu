# Pevný skript s pripojeným Gmailom

Prevádzková cesta od 10. septembra 2026 používa `automation/bridge.mjs`. Naplánovaná úloha iba načíta a zavolá tento skript; nečíta jednotlivé jedlá ani neskladá HTML či text e-mailu. Príjemca je nastavený v súkromnej úlohe, nie v tomto verejnom súbore.

Skript používa už pripojené GitHub a Gmail nástroje. Neexportuje ich prihlasovacie údaje a nevyžaduje `GMAIL_OAUTH_JSON`. Samotné vyvolanie úlohy a pokračovanie dlhšieho behu majú tokenovú réžiu. Zber, OCR, výber položiek, šablóna a všetky kontroly sú programové.

## Rozvrh

Jedna úloha beží v pracovné dni o **09:30 a 10:30 Europe/Bratislava**, od 10. 9. 2026. Ak už dnešný e-mail existuje v Sent, ďalší beh skončí pred zberom. Sviatky overuje rovnaký kalendár ako samostatný program. Staré samostatné úlohy o 09:45 a 10:00 ostávajú vypnuté.

Časovanie nezávisí od GitHub cron. Skript cez pripojený GitHub spustí nový pokus posledného dokončeného zberového buildu, vždy zo spúšťača `push`, ktorý neposiela poštu. Čaká v ohraničenej slučke a použije artefakt presne daného pokusu. Starý artefakt ani neúspešný zber neprijme.

## Odosielanie

Po stiahnutí artefaktu skript opätovne vykoná validáciu a renderer z rovnakého commitu. Overí dnešný dátum, úplnosť a kontrolný súčet pevnej šablóny. HTML aj text prenesie do Gmailu bez prepisovania a odoslanú kópiu následne porovná.

Pred odoslaním atomicky uloží zámer do vetvy `lunch-delivery-state`. Rovnakú vetvu používa samostatný Gmail program. Pri strate odpovede z Gmailu slepo neposiela znova. Súbežný beh môže potvrdiť nanajvýš jeden zámer pre dátum a príjemcu. Trvalý záznam neobsahuje adresu, obsah e-mailu ani prihlasovacie údaje.

Pripojenia GitHub a Gmail musia zostať aktívne. Chyba v pripojení alebo nečitateľné menu sa nahradia jasným zlyhaním úlohy, nie ručne vymysleným obsahom.

## Alternatíva s nulovou modelovou réžiou

Samostatný `npm run lunch:send` zostáva pripravený podľa [OAuth návodu](AUTONOMOUS.md). Pred prechodom naň treba overiť pripojenie Gmailu, skutočné odoslanie a samostatný časovač, až potom vypnúť existujúcu prevádzkovú úlohu. GitHub časový test 9. 9. 2026 nevytvoril očakávané behy; tento spúšťač preto zatiaľ nie je prevádzkovou závislosťou.

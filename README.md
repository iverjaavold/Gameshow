# Gameshow

Festspill i gameshow-stil over 10 runder. Én hovedskjerm (TV/PC) og én mobil per spiller.
En liten Node-server på Render serverer appen og kjører spillene. Ingen pakker å installere.

## Slik spiller dere

1. Åpne appen på TV/PC og trykk **«Lag nytt spill på hovedskjermen»**. Du får en kode på 4 tegn.
2. Spillerne åpner appen på mobilen, skriver koden, velger navn og lager figuren sin.
3. Hosten styrer alt med knappene nederst til høyre på hovedskjermen. «⋯» gir «Avslutt runden» hvis noe står fast.
4. Mister noen forbindelsen, åpner de siden igjen. Mobilen husker spilleren. På en ny mobil skriver de samme kode og navn.

## Mappestruktur

```
gameshow/
├── index.html        Forside: bli med / lag nytt spill
├── host.html         Hovedskjermen
├── spill.html        Mobilen
├── server.js         Server: statiske filer + API + sanntid (Server-Sent Events)
├── game/
│   ├── config.js     ALLE justerbare tall ([STANDARD] i spesifikasjonen)
│   ├── content.js    Quizspørsmål og ord til forklar-mime
│   ├── game.js       Spillmotoren: poeng, shop, kort, tyveri, betting, lederfordeler, catch-up
│   ├── randomizer.js Par og lag, unngår at de samme havner sammen
│   └── rounds/       Én fil per runde (r1-hvelvet.js … r10-finale.js)
├── css/              base.css, game.css (felles), host.css, player.css
└── js/
    ├── common.js     Felles: API, sanntid, nedtelling, figurtegning
    ├── main.js       Forsiden
    ├── host.js       Hovedskjermen
    └── player.js     Mobilen
```

All hemmelig informasjon (poeng, kort, terninger, ord, fasit, valg) ligger på serveren.
Hver klient får bare en visning bygget for akkurat den. Hovedskjermen får aldri poengtall,
bare relativ søylehøyde.

## Valg tatt der spesifikasjonen var [ÅPENT]

Alt kan justeres i `game/config.js` eller byttes ut i rundefilene.

- **Figur:** farge, kropp, ansikt og hodeplagg. Sverd, skjold og lykkestjerne fra shopen tegnes på figuren.
- **Shop-oppgraderinger:** Sverd (+2 angrep), Skjold (+2 forsvar), Lykkestjerne (+25 per riktige quizsvar). Maks 3 av hver.
- **Uno reverse** 400, **Blokk** 300.
- **Blokk mot andre:** stopper målets neste bonus (lederrente, kongebonus eller catch-up). Har målet catch-up aktiv, stoppes den med en gang.
- **Betting:** «bra» = over halvparten av `ROUND_MAX_POINTS` for runden. Bettingrunden trekkes blant runde 2–9.
- **Lederens makt:** kategori før runde 2, 6 og 9, ordkategori før runde 4, «to som må samarbeide» før runde 3, og «to som skal duellere» før runde 8. Ingen valg før de andre rundene.
- **Lederrente** deles ikke ut når alle står likt.
- **Runde 1:** parene spiller etter hverandre. Bom på kode eller lås gir også alarm. Nivået prøves på nytt med nye kast til det klares eller alarmen går. Et lag på 3 deles i to par, der én spiller går to ganger (uten poeng andre gang).
- **Runde 3:** alle par spiller samtidig. Et lag på 3 har to byggere som deler rutenett.
- **Runde 7:** lagene spiller etter hverandre med én fysisk kortstokk. Etter feil halveres potten, og laget kan fortsette. Maks 12 gjetninger.
- **Runde 8:** turbasert kamp. Begge velger Angrip/Forsvar i hemmelighet, terning + oppgraderinger avgjør. Vinneren får 400.
- **Runde 10:** potten starter på 1000, +250 per riktige svar fra finalistene. Tilskuere satser på ett av fire utfall og vinner 2× innsatsen ved riktig spådom. Finalepotten dobles ikke av catch-up.

## Kjøre appen lokalt

Installer [Node.js](https://nodejs.org) (versjon 18 eller nyere), og kjør:

```
node server.js
```

Åpne `http://localhost:3000`. For å teste med mobiler på samme nett: bruk PC-ens IP-adresse, f.eks. `http://192.168.1.20:3000`.

Serveren leser HTML/CSS/JS inn i minnet ved oppstart, så start den på nytt etter endringer.
Spillene ligger bare i minnet. Starter serveren på nytt, forsvinner pågående spill.

## Publisere på Render

1. Lag et nytt repo på GitHub som heter `gameshow`, og push koden dit.
2. Gå til Render og velg **New → Blueprint**. Koble til GitHub-repoet.
3. Render leser `render.yaml` og oppretter webtjenesten `gameshow`.

Når du pusher endringer til repoet, publiserer Render den nye versjonen automatisk.

Merk: gratisplanen på Render sovner etter en stund uten trafikk, og en omstart sletter pågående spill.
Åpne siden noen minutter før dere starter, og ikke push nye versjoner midt i et spill.

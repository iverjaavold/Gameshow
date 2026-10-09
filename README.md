# Gameshow

Festspill i gameshow-stil med 10 store runder og 9 minirunder. Én hovedskjerm (TV/PC) og én mobil per spiller.
En liten Node-server på Render serverer appen og kjører spillene. Ingen pakker å installere.

## Slik spiller dere

1. Åpne appen på TV/PC og trykk **«Lag nytt spill på hovedskjermen»**. Du får en kode på 4 tegn.
2. Spillerne åpner appen på mobilen, skriver koden, velger navn og lager figuren sin.
3. I lobbyen krysser hosten av hvilke spill som skal være med (alle er valgt fra start).
   Appen viser omtrentlig spilletid, setter opp rekkefølgen selv og legger finalen sist.
   «Lagre oppsett» husker utvalget på denne maskinen til neste gang.
4. Trykk **«Start spillet»**. Etter det trykker hosten bare **«Start runde»** før hvert spill,
   og **grønn/rød** der et menneske må vurdere et svar (mime, kortstokken i runde 7 og Lynrunden).
   Alt annet – nedtellinger, neste spørsmål, avsløringer og overganger – skjer av seg selv.
   «⋯» nederst til høyre har manuelle overstyringer hvis noe skulle stå fast.
   «⏸ Pause» nederst fryser alle nedtellinger og automatikk til hosten trykker «▶ Fortsett».
5. Mister noen forbindelsen, åpner de siden igjen. Mobilen husker spilleren. På en ny mobil skriver de samme kode og navn.

### Del og tilbakemelding

«Del lenke» på hovedskjermen åpner delingsmenyen (eller kopierer lenken). Lenken fyller inn koden automatisk.
«Tilbakemelding» (forsiden og hovedskjermen) lar folk sende en **Bugg** eller **Idé**. Meldingene skrives til
serverloggen (søk etter `[tilbakemelding]` i Render-loggen) og til `tilbakemeldinger.jsonl`
(eller filen i miljøvariabelen `FEEDBACK_FILE`). Filen forsvinner ved ny deploy på Render uten disk.

### Testmodus

Trykk **«+ Legg til bot (testmodus)»** i lobbyen. Bots spiller alle lekene med tilfeldige svar,
så hele spillet kan testes av én person. Bots kan fjernes med ✕ før spillet starter.

## Spillene

**Store runder:** 1 Hvelvet · 2 Kongen på haugen · 3 Tegn etter beskrivelse · 4 Forklar-mime ·
5 Hvor mange reiser seg? · 6 Lagduellen · 7 Allianse eller svik · 8 Figurkamp · 9 Lynrunden (buzzer) · 10 Del eller stjel (finalen)

**Minirunder:** Hvem er hvilket dyr? · Gjett 30 sekunder · Tenk likt · Auksjonen (opptil 4 ganger) ·
Reaksjonstest · Estimering · Gruva · Bildezoom · Blunke-mafia (anbefalt 5+ deltakere)

Regler som før var knyttet til rundenumre, skaleres etter antall valgte spill (se `game/config.js`):
innloggingen stenger halvveis, shopen stenger når 70 % er spilt, og betting og «Kjøp en medspiller»
legges før passende valgte spill. Catch-up teller alle spill, også minirunder.

## Mappestruktur

```
gameshow/
├── index.html          Forside: bli med / lag nytt spill
├── host.html           Hovedskjermen
├── spill.html          Mobilen
├── server.js           Server: statiske filer + API + sanntid (Server-Sent Events)
├── game/
│   ├── config.js       ALLE justerbare tall ([STANDARD] i spesifikasjonen)
│   ├── content.js      Quizspørsmål og ord til forklar-mime
│   ├── content-mini.js Lynrunden, Tenk likt, Estimering, dyreliste og bildebank
│   ├── game.js         Spillmotoren: plan, poeng, shop, kort, tyveri, betting, lederfordeler, catch-up, bots
│   ├── plan.js         Setter opp rekkefølgen på de valgte spillene
│   ├── text.js         Sammenligning av fritekst (små skrivefeil godtas)
│   ├── randomizer.js   Par og lag, unngår at de samme havner sammen
│   └── rounds/         Én fil per spill (r1-hvelvet.js … r10-finale.js, mini-*.js)
├── assets/bilder/      Egne bilder til Bildezoom (valgfritt)
├── css/                base.css, game.css (felles), host.css, player.css
└── js/
    ├── common.js       Felles: API, sanntid, nedtelling, animasjoner, figurtegning
    ├── main.js         Forsiden
    ├── host.js         Hovedskjermen
    └── player.js       Mobilen
```

All hemmelig informasjon (poeng, kort, terninger, ord, fasit, bud, gjetninger, rastidspunkt) ligger på serveren
til den skal avsløres. Hver klient får bare en visning bygget for akkurat den. Hovedskjermen får aldri poengtall,
bare relativ søylehøyde.

## Egne bilder til Bildezoom

Legg bildefilene i `assets/bilder/` og lag filen `assets/bilder/bilder.json` med godkjente svar:

```json
[
  { "fil": "eiffeltarnet.jpg", "svar": ["eiffeltårnet", "eiffel tower", "eiffel"] },
  { "fil": "elefant.png", "svar": ["elefant"] }
]
```

Finnes `bilder.json`, brukes bare disse bildene. Ellers brukes de innebygde emoji-bildene.
Se `assets/bilder/bilder.eksempel.json`. Start serveren på nytt etter at du har lagt til bilder.

## Valg tatt der spesifikasjonen var [ÅPENT]

Alt kan justeres i `game/config.js` eller byttes ut i rundefilene.

- **Figur:** farge, kropp, ansikt og hodeplagg. Sverd, skjold og lykkestjerne fra shopen tegnes på figuren.
- **Shop-oppgraderinger:** Sverd (+2 angrep), Skjold (+2 forsvar), Lykkestjerne (+25 per riktige quizsvar). Maks 3 av hver.
- **Uno reverse** 400, **Blokk** 300.
- **Blokk mot andre:** stopper målets neste bonus (lederrente, kongebonus eller catch-up). Har målet catch-up aktiv, stoppes den med en gang.
- **Betting:** «bra» = over halvparten av `ROUND_MAX_POINTS` for spillet. Bettingen kommer før ett tilfeldig spill som gir poeng (ikke det første).
- **Lederens makt:** kategori før runde 2 og 6, ordkategori før runde 4, «to som må samarbeide» før runde 3, og «to som skal duellere» før runde 8. Lederen har 30 sekunder, ellers hoppes valget over.
- **Lederrente** deles ikke ut når alle står likt.
- **Rekkefølge:** de store rundene kommer i fast rekkefølge (de veksler allerede mellom samarbeid, konkurranse og strategi). Minirundene spres jevnt mellom dem, helst med en annen type enn spillet før.
- **Runde 1:** parene spiller etter hverandre og kaster selv (automatisk etter 45 sekunders snakketid). Bom på kode eller lås gir også alarm.
- **Runde 3:** alle par spiller samtidig. Et lag på 3 har to byggere som deler rutenett.
- **Runde 7:** lagene spiller etter hverandre med én fysisk kortstokk. Laget registrerer selv; hosten har grønn/rød for kortet.
- **Runde 8:** turbasert kamp. Begge velger Angrip/Forsvar i hemmelighet, terning + oppgraderinger avgjør. Vinneren får 400.
- **Lynrunden:** fasiten vises sløret for hosten mens noen svarer (hold musen over for å se den).
- **Runde 10:** potten starter på 1000, +250 per riktige svar fra finalistene. Tilskuere satser på ett av fire utfall og vinner 2× innsatsen ved riktig spådom.
- **Gjett 30 sekunder:** tiden måles på serveren når trykket kommer inn.

## Kjøre appen lokalt

Installer [Node.js](https://nodejs.org) (versjon 18 eller nyere), og kjør:

```
node server.js
```

Åpne `http://localhost:3000`. For å teste med mobiler på samme nett: bruk PC-ens IP-adresse, f.eks. `http://192.168.1.20:3000`.

Serveren leser HTML/CSS/JS inn i minnet ved oppstart, så start den på nytt etter endringer.
Spillene ligger bare i minnet. Starter serveren på nytt, forsvinner pågående spill.

For raske tester kan tiden skrus opp: `GAMESHOW_TIME_SCALE=0.25 node server.js` gjør alle tider 4 ganger kortere.

## Publisere på Render

1. Lag et nytt repo på GitHub som heter `gameshow`, og push koden dit.
2. Gå til Render og velg **New → Blueprint**. Koble til GitHub-repoet.
3. Render leser `render.yaml` og oppretter webtjenesten `gameshow`.

Når du pusher endringer til repoet, publiserer Render den nye versjonen automatisk.

Merk: gratisplanen på Render sovner etter en stund uten trafikk, og en omstart sletter pågående spill.
Åpne siden noen minutter før dere starter, og ikke push nye versjoner midt i et spill.

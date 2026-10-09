/*
  Oversikt over alle spill: modul, navn, type, varighet, beskrivelse, regler (intro på hovedskjermen)
  og hva lederen kan bestemme før spillet («Lederens makt»).
*/

const { QUESTION_CATEGORIES, WORD_CATEGORIES } = require("../content");

const GAMES = {
  r1: {
    module: () => require("./r1-hvelvet"), big: true, type: "samarbeid", minutes: 15,
    title: "Hvelvet", tag: "Stille samarbeid – to og to",
    desc: "Parene bryter seg inn i et hvelv med terninger – uten å snakke.",
    rules: [
      "Parene prøver å bryte seg inn i et hvelv med 5 nivåer.",
      "Hver spiller får 4 terninger som bare vises på egen mobil.",
      "Snakk om strategi før kastet. Etter kastet er det FORBUDT å snakke!",
      "Legg én terning om gangen: Balanse, Kode, Lås – eller Fokus for en ±1-polett.",
      "Feil gir alarm. Tre alarmer, og hvelvet stenger."
    ]
  },
  r2: {
    module: () => require("./r2-konge"), big: true, type: "konkurranse", minutes: 7,
    title: "Kongen på haugen", tag: "Alle mot alle",
    desc: "Quiz der raskeste riktige svar gir kronen.",
    rules: [
      "Alle svarer på samme spørsmål samtidig på mobilen.",
      "Raskest med riktig svar blir konge og får kronen.",
      "Kongen får bonuspoeng for hvert spørsmål tronen holdes.",
      "Svar raskere og riktig for å velte kongen!"
    ]
  },
  r3: {
    module: () => require("./r3-tegn"), big: true, type: "samarbeid", minutes: 10,
    title: "Tegn etter beskrivelse", tag: "Samarbeid – to og to",
    desc: "Én forklarer en figur med ord, den andre bygger den.",
    rules: [
      "Én forklarer og én bygger. Forklareren ser fasiten, byggeren et tomt rutenett.",
      "Forklar figuren med ord – ikke vis skjermen!",
      "Form, farge og rotasjon må stemme i hver rute.",
      "Figurene blir vanskeligere, og rollene byttes hver gang."
    ]
  },
  r4: {
    module: () => require("./r4-mime"), big: true, type: "samarbeid", minutes: 10,
    title: "Forklar-mime", tag: "Lag mot lag",
    desc: "Forklareren beskriver bevegelser, mimeren gjør dem, laget gjetter.",
    rules: [
      "Bare forklareren ser ordet.",
      "Forklareren får BARE beskrive bevegelser – aldri ordet eller hva det er.",
      "Mimeren gjør bevegelsene, og resten av laget gjetter.",
      "Poeng for hvert riktig ord før tiden går ut."
    ]
  },
  r5: {
    module: () => require("./r5-reis"), big: true, type: "strategi", minutes: 6,
    title: "Hvor mange reiser seg?", tag: "Alle mot alle",
    desc: "Gjett hvor mange som reiser seg – og bløff med ditt eget valg.",
    rules: [
      "Gjett i hemmelighet hvor mange som kommer til å reise seg.",
      "Når timeren starter, velger alle «Stå» eller «Sitt» på mobilen.",
      "Ved 0 reiser de som valgte «Stå» seg.",
      "Riktig gjetning gir mest, én unna gir litt. Bløff er lov!"
    ]
  },
  r6: {
    module: () => require("./r6-lagduell"), big: true, type: "konkurranse", minutes: 8,
    title: "Lagduellen", tag: "Lag – og én mot én",
    desc: "Lagene kårer en mester som duellerer mot den andre.",
    rules: [
      "To lag. Alle svarer på raske spørsmål.",
      "Raskest med riktig svar blir lagets mester.",
      "Mesterne duellerer: raskest og riktig vinner – best av 5.",
      "Feil svar gir poenget til motstanderen."
    ]
  },
  r7: {
    module: () => require("./r7-allianse"), big: true, type: "strategi", minutes: 12,
    title: "Allianse eller svik", tag: "Lag på 2–3 + fysisk kortstokk",
    desc: "Høyere eller lavere med ekte kortstokk – så del eller ta alt.",
    rules: [
      "Snu et kort fra kortstokken. Gjett om neste kort er høyere eller lavere.",
      "Riktig: +100 i potten. Feil: potten halveres.",
      "Trykk «Stopp» når som helst for å sikre potten.",
      "Til slutt: «Del» eller «Ta alt selv» – i hemmelighet!"
    ]
  },
  r8: {
    module: () => require("./r8-figurkamp"), big: true, type: "konkurranse", minutes: 5,
    title: "Figurkamp", tag: "Én mot én",
    desc: "Figurene kjemper. Oppgraderinger fra shopen gir fordeler.",
    rules: [
      "Figurene kjemper!",
      "Velg «Angrip» eller «Forsvar» i hver runde.",
      "Sverd gir ekstra angrep, skjold gir ekstra forsvar.",
      "Den med mest liv igjen vinner."
    ]
  },
  r9: {
    module: () => require("./r9-lyn"), big: true, type: "konkurranse", minutes: 4,
    title: "Lynrunden", tag: "Buzzer – alle mot alle",
    desc: "Fem raske spørsmål. Første på buzzeren svarer høyt.",
    rules: [
      "Fem spørsmål kommer etter hverandre på skjermen.",
      "Trykk på den røde buzzeren på mobilen. Den som er først, svarer høyt.",
      "Du har 5 sekunder. Riktig: +200. Feil eller ikke svar: −100.",
      "Trykker ingen innen 10 sekunder, hoppes spørsmålet over."
    ]
  },
  r10: {
    module: () => require("./r10-finale"), big: true, type: "strategi", minutes: 3,
    title: "Finale: Del eller stjel", tag: "De to beste",
    desc: "De to beste spiller om potten – del eller stjel?",
    rules: [
      "De to spillerne med flest poeng går til finalen og spiller om en pott på 3000.",
      "Først får de prate og prøve å overtale hverandre.",
      "Så velger begge «Del» eller «Stjel» – i hemmelighet.",
      "Begge deler: potten deles. Én stjeler: hen tar alt. Begge stjeler: ingen får noe.",
      "Alle andre satser poeng på hva finalistene velger!"
    ]
  },

  // Minirunder
  dyr: {
    module: () => require("./mini-dyr"), type: "strategi", minutes: 5,
    title: "Hvem er hvilket dyr?", tag: "Minirunde",
    desc: "Alle skriver et dyr. Gjett hvem som skrev hva – ett dyr er falskt.",
    rules: [
      "Skriv et dyr i hemmelighet på mobilen.",
      "Appen legger til ett ekstra dyr som ingen har skrevet.",
      "Koble dyrene til riktig spiller. Ett dyr blir til overs!",
      "100 poeng per riktig kobling."
    ]
  },
  tretti: {
    module: () => require("./mini-tretti"), type: "konkurranse", minutes: 2,
    title: "Gjett 30 sekunder", tag: "Minirunde",
    desc: "Trykk når du tror det har gått nøyaktig 30 sekunder.",
    rules: [
      "Når det står «Nå!», starter tiden. Ingen klokke vises.",
      "Trykk på mobilen når du tror det har gått nøyaktig 30 sekunder.",
      "−50 poeng per sekund du bommer med."
    ]
  },
  tenk: {
    module: () => require("./mini-tenk"), type: "samarbeid", minutes: 4,
    title: "Tenk likt", tag: "Minirunde",
    desc: "Skriv det du tror flest andre skriver.",
    rules: [
      "En kategori vises på skjermen, for eksempel «en frukt».",
      "Skriv det du tror FLEST andre kommer til å skrive.",
      "100 poeng for hver annen spiller som skrev det samme som deg."
    ]
  },
  auksjon: {
    module: () => require("./mini-auksjon"), type: "strategi", minutes: 1,
    title: "Auksjonen", tag: "Hemmelig pakke",
    desc: "By på en hemmelig pakke med poeng eller et shop-kort. Kommer opptil 4 ganger.",
    rules: [
      "En hemmelig pakke er til salgs. Innholdet er alltid positivt.",
      "Den inneholder poeng eller et kort fra shopen.",
      "By i hemmelighet. Høyeste bud betaler og får pakken."
    ]
  },
  reaksjon: {
    module: () => require("./mini-reaksjon"), type: "konkurranse", minutes: 2,
    title: "Reaksjonstest", tag: "Minirunde – F1-start",
    desc: "Fem røde lys. Trykk så fort du kan når de slukker.",
    rules: [
      "Fem røde lys tennes ett og ett.",
      "Når alle lysene slukker, trykker du så fort du kan.",
      "Tyvstart gir −100 poeng!",
      "De tre raskeste får poeng."
    ]
  },
  estimat: {
    module: () => require("./mini-estimat"), type: "konkurranse", minutes: 5,
    title: "Estimering", tag: "Minirunde",
    desc: "Gjett tallet. Nærmest fasiten vinner.",
    rules: [
      "Et spørsmål med et tall som svar vises på skjermen.",
      "Skriv inn tallet du tror på mobilen.",
      "Nærmest: +300, nest nærmest: +200, tredje: +100."
    ]
  },
  gruva: {
    module: () => require("./mini-gruva"), type: "strategi", minutes: 2,
    title: "Gruva", tag: "Minirunde",
    desc: "Poengene stiger – men når raser gruva?",
    rules: [
      "Poengverdien stiger hele tiden.",
      "Trykk «Ta poengene» når du vil, og få verdien akkurat da.",
      "Når som helst kan gruva rase. Er du fortsatt inne, får du −500!"
    ]
  },
  bilde: {
    module: () => require("./mini-bilde"), type: "konkurranse", minutes: 4,
    title: "Bildezoom", tag: "Minirunde",
    desc: "Et bilde zoomer sakte ut. Gjett hva det er først.",
    rules: [
      "Et bilde starter ekstremt zoomet inn og zoomer sakte ut.",
      "Skriv hva du tror det er. Du kan gjette flere ganger.",
      "Jo tidligere riktig, jo flere poeng. Feil gir 5 sekunders pause."
    ]
  }
};

const ALL_IDS = Object.keys(GAMES);

function categoryOptions(list) {
  return list.map(c => ({ id: c, label: c }));
}

// Hva lederen kan bestemme før spillet. null = ingen valg.
function leaderPowerFor(id) {
  switch (id) {
    case "r2":
    case "r6":
      return { kind: "option", prompt: "Velg spørsmålskategori for neste runde", options: categoryOptions(QUESTION_CATEGORIES) };
    case "r3":
      return { kind: "twoPlayers", prompt: "Velg to spillere som MÅ samarbeide i neste runde" };
    case "r4":
      return { kind: "option", prompt: "Velg ordkategori for forklar-mime", options: categoryOptions(WORD_CATEGORIES) };
    case "r8":
      return { kind: "twoPlayers", prompt: "Velg to figurer som skal duellere mot hverandre" };
    default:
      return null;
  }
}

function roundClass(id) {
  return GAMES[id].module();
}

module.exports = { GAMES, ALL_IDS, leaderPowerFor, roundClass };

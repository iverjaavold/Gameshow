/*
  Oversikt over rundene: modul, navn, regler (intro på hovedskjermen)
  og hva lederen kan bestemme før runden («Lederens makt»).
*/

const { QUESTION_CATEGORIES, WORD_CATEGORIES } = require("../content");

const ROUNDS = {
  1: require("./r1-hvelvet"),
  2: require("./r2-konge"),
  3: require("./r3-tegn"),
  4: require("./r4-mime"),
  5: require("./r5-reis"),
  6: require("./r6-lagduell"),
  7: require("./r7-allianse"),
  8: require("./r8-figurkamp"),
  9: require("./r9-lyn"),
  10: require("./r10-finale")
};

const ROUND_INFO = {
  1: {
    title: "Hvelvet",
    tag: "Stille samarbeid – to og to",
    rules: [
      "Parene prøver å bryte seg inn i et hvelv med 5 nivåer.",
      "Hver spiller får 4 terninger som bare vises på egen mobil.",
      "Snakk om strategi før kastet. Etter kastet er det FORBUDT å snakke!",
      "Legg én terning om gangen: Balanse, Kode, Lås – eller Fokus for en ±1-polett.",
      "Feil gir alarm. Tre alarmer, og hvelvet stenger."
    ]
  },
  2: {
    title: "Kongen på haugen",
    tag: "Alle mot alle",
    rules: [
      "Alle svarer på samme spørsmål samtidig på mobilen.",
      "Raskest med riktig svar blir konge og får kronen.",
      "Kongen får bonuspoeng for hvert spørsmål tronen holdes.",
      "Svar raskere og riktig for å velte kongen!"
    ]
  },
  3: {
    title: "Tegn etter beskrivelse",
    tag: "Samarbeid – to og to",
    rules: [
      "Én forklarer og én bygger. Forklareren ser fasiten, byggeren et tomt rutenett.",
      "Forklar figuren med ord – ikke vis skjermen!",
      "Form, farge og rotasjon må stemme i hver rute.",
      "Figurene blir vanskeligere, og rollene byttes hver gang."
    ]
  },
  4: {
    title: "Forklar-mime",
    tag: "Lag mot lag",
    rules: [
      "Bare forklareren ser ordet.",
      "Forklareren får BARE beskrive bevegelser – aldri ordet eller hva det er.",
      "Mimeren gjør bevegelsene, og resten av laget gjetter.",
      "Poeng for hvert riktig ord før tiden går ut."
    ]
  },
  5: {
    title: "Hvor mange reiser seg?",
    tag: "Alle mot alle",
    rules: [
      "Gjett i hemmelighet hvor mange som kommer til å reise seg.",
      "Når timeren starter, velger alle «Stå» eller «Sitt» på mobilen.",
      "Ved 0 reiser de som valgte «Stå» seg.",
      "Riktig gjetning gir mest, én unna gir litt. Bløff er lov!"
    ]
  },
  6: {
    title: "Lagduellen",
    tag: "Lag – og én mot én",
    rules: [
      "To lag. Alle svarer på raske spørsmål.",
      "Raskest med riktig svar blir lagets mester.",
      "Mesterne duellerer: raskest og riktig vinner – best av 5.",
      "Feil svar gir poenget til motstanderen."
    ]
  },
  7: {
    title: "Allianse eller svik",
    tag: "Lag på 2–3 + fysisk kortstokk",
    rules: [
      "Snu et kort fra kortstokken. Gjett om neste kort er høyere eller lavere.",
      "Riktig: +100 i potten. Feil: potten halveres.",
      "Trykk «Stopp» når som helst for å sikre potten.",
      "Til slutt: «Del» eller «Ta alt selv» – i hemmelighet!"
    ]
  },
  8: {
    title: "Figurkamp",
    tag: "Én mot én",
    rules: [
      "Figurene kjemper! Shopen er nå stengt.",
      "Velg «Angrip» eller «Forsvar» i hver runde.",
      "Sverd gir ekstra angrep, skjold gir ekstra forsvar.",
      "Den med mest liv igjen vinner."
    ]
  },
  9: {
    title: "Lynrunden",
    tag: "Alle mot alle – doble poeng",
    rules: [
      "Mange raske spørsmål. Doble poeng for alle!",
      "Spørsmålene går automatisk videre – vær rask."
    ]
  },
  10: {
    title: "Finale: Del eller stjel",
    tag: "De to beste",
    rules: [
      "De to spillerne med flest poeng går til finalen.",
      "Finalistene bygger en stor pott med raske spørsmål.",
      "Til slutt: «Del» eller «Stjel» – i hemmelighet.",
      "Alle andre satser poeng på hva finalistene velger!"
    ]
  }
};

function categoryOptions(list) {
  return list.map(c => ({ id: c, label: c }));
}

// Hva lederen kan bestemme før runde n. null = ingen valg.
function leaderPowerFor(game, n) {
  switch (n) {
    case 2:
    case 6:
    case 9:
      return { kind: "option", prompt: "Velg spørsmålskategori for neste runde", options: categoryOptions(QUESTION_CATEGORIES) };
    case 3:
      return { kind: "twoPlayers", prompt: "Velg to spillere som MÅ samarbeide i neste runde" };
    case 4:
      return { kind: "option", prompt: "Velg ordkategori for forklar-mime", options: categoryOptions(WORD_CATEGORIES) };
    case 8:
      return { kind: "twoPlayers", prompt: "Velg to figurer som skal duellere mot hverandre" };
    default:
      return null;
  }
}

module.exports = { ROUNDS, ROUND_INFO, leaderPowerFor };

/*
  Samlet konfigurasjon. Alle tall merket [STANDARD] i spesifikasjonen ligger her,
  så de er lette å justere uten å lete i koden. Tider er i sekunder.
*/

module.exports = {
  // Spillkode og innlogging
  CODE_LENGTH: 4,
  CODE_ALPHABET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", // uten O/0 og I/1
  MAX_NAME_LENGTH: 16,
  LATE_JOIN_PENALTY: 100, // sene spillere starter så mye under den som ligger sist
  MIN_PLAYERS: 2,
  GAME_IDLE_TIMEOUT_MS: 12 * 60 * 60 * 1000, // spill slettes etter 12 timer uten aktivitet

  // Regler som skaleres etter antall valgte spill (andel av spillet)
  JOIN_CLOSES_AT: 0.5, // innlogging stenger når spillet når halvveis (spill 5 av 10)
  SHOP_CLOSES_AT: 0.7, // shopen stenger når 70 % av spillene er ferdige (før spill 8 av 10)
  MAX_AUCTIONS: 4, // auksjonen kommer opptil så mange ganger
  GAMES_PER_AUCTION: 4, // én auksjon per så mange andre spill (færre spill gir færre auksjoner)

  // Automatikk: hvor lenge skjermen står før appen går videre av seg selv
  ROUND_END_SECONDS: 10, // oppsummering etter hvert spill
  BETTING_SECONDS: 30,
  BID_SECONDS: 30, // budrunden i «Kjøp en medspiller»
  ALL_DONE_DELAY_SECONDS: 3, // når alle har svart: kort pause før appen går videre

  // Globale regler
  LEADER_INTEREST: 100, // lederrente etter hvert spill
  LEADER_POWER_SECONDS: 30, // lederen må velge innen så lang tid, ellers hoppes valget over
  CATCHUP_GAP: 1000, // mer enn så mye bak lederen gir catch-up
  CATCHUP_ROUNDS: 3, // antall spill med doble poeng (minirunder teller også)
  CATCHUP_MULTIPLIER: 2,

  // Betting før ett tilfeldig spill
  BETTING_GOOD_RATIO: 0.5, // «bra» = over halvparten av maks mulige poeng i spillet

  // Kjøp en medspiller (legges før første valgte av disse spillene)
  BUY_TEAMMATE_BEFORE: ["r7", "r3", "r1"],
  BUY_TEAMMATE_PICK_SECONDS: 30,

  // Shop
  THEFT_RESPONSE_SECONDS: 10,
  SHOP_ITEMS: [
    { id: "steal250", kind: "card", card: "steal", value: 250, price: 225, name: "Tyverikort 250", desc: "Stjel 250 poeng fra en annen spiller." },
    { id: "steal500", kind: "card", card: "steal", value: 500, price: 450, name: "Tyverikort 500", desc: "Stjel 500 poeng fra en annen spiller." },
    { id: "steal1000", kind: "card", card: "steal", value: 1000, price: 900, name: "Tyverikort 1000", desc: "Stjel 1000 poeng fra en annen spiller." },
    { id: "uno", kind: "card", card: "uno", price: 400, name: "Uno reverse", desc: "Snu et tyveri: tyven mister verdien til deg i stedet." },
    { id: "block", kind: "card", card: "block", price: 300, name: "Blokk", desc: "Stopp et tyveri mot deg, eller blokker neste bonus for en annen spiller." },
    { id: "sword", kind: "upgrade", upgrade: "sword", price: 300, name: "Sverd", desc: "+2 angrep i figurkampen.", max: 3 },
    { id: "shield", kind: "upgrade", upgrade: "shield", price: 300, name: "Skjold", desc: "+2 forsvar i figurkampen.", max: 3 },
    { id: "star", kind: "upgrade", upgrade: "star", price: 400, name: "Lykkestjerne", desc: "+25 bonuspoeng på hvert riktige quizsvar.", max: 3 }
  ],
  UPGRADE_SWORD_ATTACK: 2,
  UPGRADE_SHIELD_DEFENSE: 2,
  UPGRADE_STAR_BONUS: 25,

  // Maks mulige poeng per spill (brukes til betting). Spill som mangler her, kan ikke få betting.
  ROUND_MAX_POINTS: {
    r1: 1000, r2: 2000, r3: 1500, r4: 900, r5: 1500, r6: 500, r7: 1500, r8: 400, r9: 1000,
    dyr: 600, tenk: 1500, reaksjon: 300, estimat: 1500, gruva: 1500, bilde: 2500
  },

  // Runde 1 – Hvelvet
  R1: {
    LEVELS: 5,
    DICE_PER_PLAYER: 4,
    CODE_TARGETS: [8, 9, 10, 9, 10],
    LOCK_VALUES: [5, 6, 5, 6, 6],
    BALANCE_MAX_DIFF: 2,
    ALARM_MAX: 3,
    POINTS_PER_LEVEL: 200,
    TALK_SECONDS: 45, // snakketid før kastet; kaster ingen, kastes terningene automatisk
    AUTO_NEXT_SECONDS: 6, // går automatisk til neste forsøk etter et nivå
    AUTO_NEXT_PAIR_SECONDS: 10 // går automatisk til neste par / avslutter runden
  },

  // Runde 2 – Kongen på haugen
  R2: {
    QUESTIONS: 10,
    QUESTION_SECONDS: 15,
    REVEAL_SECONDS: 5,
    CORRECT_POINTS: 100,
    THRONE_BONUS: 100
  },

  // Runde 3 – Tegn etter beskrivelse
  R3: {
    GRID: 5,
    FIGURES: 5, // antall figurer per par (én per nivå)
    SECONDS_PER_FIGURE: 90,
    POINTS_PER_LEVEL: 100, // nivå 1 = 100, nivå 5 = 500
    SHAPES_LEVEL_1: 2 // antall former på nivå 1, +1 per nivå
  },

  // Runde 4 – Forklar-mime
  R4: {
    TURNS_PER_TEAM: 2,
    TURN_SECONDS: 60,
    POINTS_PER_WORD: 100,
    READY_SECONDS: 15, // turen starter av seg selv hvis forklareren ikke trykker
    BETWEEN_TURNS_SECONDS: 6
  },

  // Runde 5 – Hvor mange reiser seg?
  R5: {
    ROUNDS: 5,
    GUESS_SECONDS: 20, // tid til å gjette før Stå/Sitt-timeren starter
    TIMER_SECONDS: 10,
    REVEAL_SECONDS: 10,
    EXACT_POINTS: 300,
    OFF_BY_ONE_POINTS: 100
  },

  // Runde 6 – Lagduellen
  R6: {
    QUESTION_SECONDS: 12,
    REVEAL_SECONDS: 4,
    DUEL_WINS_NEEDED: 3, // best av 5
    CHAMPION_POINTS: 500,
    TEAM_POINTS: 200
  },

  // Runde 7 – Allianse eller svik
  R7: {
    POT_PER_CORRECT: 100,
    MAX_GUESSES: 12,
    CHOICE_SECONDS: 20,
    REVEAL_SECONDS: 12
  },

  // Runde 8 – Figurkamp
  R8: {
    HP: 12,
    EXCHANGES: 6,
    CHOICE_SECONDS: 10,
    RESULT_SECONDS: 4,
    WIN_POINTS: 400,
    BASE_ATTACK: 0,
    BASE_DEFENSE: 0,
    BLOCK_COUNTER_DAMAGE: 2
  },

  // Runde 9 – Lynrunden (buzzer)
  R9: {
    START_COUNTDOWN: 10,
    QUESTIONS: 5,
    BUZZ_SECONDS: 10, // trykker ingen innen dette, hoppes spørsmålet over
    ANSWER_SECONDS: 5, // tid den som buzzet har til å svare
    REVEAL_SECONDS: 5, // så lenge riktig svar vises før neste spørsmål
    CORRECT_POINTS: 200,
    WRONG_POINTS: -100
  },

  // Runde 10 – Finale
  R10: {
    POT: 3000,
    TALK_SECONDS: 45, // finalistene prater og prøver å overtale hverandre, tilskuerne satser
    CHOICE_SECONDS: 20,
    REVEAL_END_SECONDS: 10,
    SPECTATOR_BET_PAYOUT: 2 // riktig spådom gir innsats × dette i gevinst
  },

  // Minirunde – Hvem er hvilket dyr?
  DYR: {
    WRITE_SECONDS: 45,
    SHOW_SECONDS: 15, // listen vises før koblingen starter
    MATCH_SECONDS: 60,
    REVEAL_SECONDS: 15,
    POINTS_PER_MATCH: 100
  },

  // Minirunde – Gjett 30 sekunder
  TRETTI: {
    TARGET_SECONDS: 30,
    MAX_SECONDS: 60, // den som ikke har stoppet så lenge etter sin egen start, regnes som 30 sekunder unna
    ROUND_SECONDS: 120, // hele runden: den som ikke har startet innen dette, regnes også som 30 sekunder unna
    MISSING_OFF_SECONDS: 30,
    POINTS_PER_SECOND_OFF: -50,
    REVEAL_SECONDS: 12
  },

  // Minirunde – Tenk likt
  TENK: {
    PROMPTS: 5,
    ANSWER_SECONDS: 15,
    REVEAL_SECONDS: 8,
    POINTS_PER_MATCH: 100
  },

  // Minirunde – Auksjonen
  AUKSJON: {
    BID_SECONDS: 20,
    // Pakken inneholder et tilfeldig antall poeng mellom disse (alltid positivt)
    PRIZE_MIN: 100,
    PRIZE_MAX: 1500,
    PRIZE_STEP: 50,
    REVEAL_SECONDS: 6
  },

  // Minirunde – Reaksjonstest (F1-start)
  REAKSJON: {
    LEAD_IN_SECONDS: 3, // tid før første lys
    LIGHTS: 5,
    LIGHT_INTERVAL_SECONDS: 1,
    MIN_WAIT_SECONDS: 3, // etter siste lys
    MAX_WAIT_SECONDS: 6,
    REPORT_SECONDS: 6, // så lenge mobilene har på seg etter at lysene slukket
    PRIZES: [300, 200, 100],
    FALSE_START_POINTS: -100,
    REVEAL_SECONDS: 12
  },

  // Minirunde – Estimering
  ESTIMAT: {
    QUESTIONS: 5,
    ANSWER_SECONDS: 30,
    REVEAL_SECONDS: 10,
    PRIZES: [300, 200, 100]
  },

  // Minirunde – Gruva
  GRUVA: {
    LEAD_IN_SECONDS: 3,
    POINTS_PER_SECOND: 50,
    ACCELERATION: 1, // ekstra poeng: ACCELERATION × sekunder² (raskere stigning mot slutten)
    MIN_CRASH_SECONDS: 10,
    MAX_CRASH_SECONDS: 40,
    CRASH_POINTS: -500,
    REVEAL_SECONDS: 8
  },

  // Minirunde – Bildezoom
  BILDE: {
    IMAGES: 5,
    ZOOM_SECONDS: 20, // fra helt inn til helt ute
    EXTRA_SECONDS: 5, // tid til å gjette etter at bildet er helt ute
    START_ZOOM: 14,
    MAX_POINTS: 500,
    MIN_POINTS: 100,
    WRONG_COOLDOWN_SECONDS: 5,
    REVEAL_SECONDS: 4,
    FOLDER: "assets/bilder" // egne bilder: se README
  },

  // Fritekst: små skrivefeil godtas for ord på over så mange bokstaver
  FUZZY_MIN_LENGTH: 4,
  FUZZY_MAX_DISTANCE: 1,

  // Testmodus: hvor ofte bots tenker
  BOT_TICK_SECONDS: 0.7,

  // Live-oppdateringer
  HEARTBEAT_MS: 20000
};

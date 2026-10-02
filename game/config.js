/*
  Samlet konfigurasjon. Alle tall merket [STANDARD] i spesifikasjonen ligger her,
  så de er lette å justere uten å lete i koden.
*/

module.exports = {
  // Spillkode og innlogging
  CODE_LENGTH: 4,
  CODE_ALPHABET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", // uten O/0 og I/1
  MAX_NAME_LENGTH: 16,
  JOIN_CLOSES_AT_ROUND: 5, // innlogging stenger når denne runden starter
  LATE_JOIN_PENALTY: 100, // sene spillere starter så mye under den som ligger sist
  MIN_PLAYERS: 2,
  GAME_IDLE_TIMEOUT_MS: 12 * 60 * 60 * 1000, // spill slettes etter 12 timer uten aktivitet

  // Globale regler
  LEADER_INTEREST: 100, // lederrente etter hver runde
  CATCHUP_GAP: 1000, // mer enn så mye bak lederen gir catch-up
  CATCHUP_ROUNDS: 3, // antall runder med doble poeng
  CATCHUP_MULTIPLIER: 2,

  // Betting før én tilfeldig runde
  BETTING_ROUND_CANDIDATES: [2, 3, 4, 5, 6, 7, 8, 9],
  BETTING_GOOD_RATIO: 0.5, // «bra» = over halvparten av maks mulige poeng i runden

  // Kjøp en medspiller
  BUY_TEAMMATE_ROUND: 7,
  BUY_TEAMMATE_PICK_SECONDS: 30,

  // Shop
  SHOP_CLOSES_AT_ROUND: 8,
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

  // Maks mulige poeng per runde (brukes til betting og poengskala)
  ROUND_MAX_POINTS: { 1: 1000, 2: 2000, 3: 1500, 4: 900, 5: 1500, 6: 500, 7: 1500, 8: 400, 9: 1500, 10: 2000 },

  // Runde 1 – Hvelvet
  R1: {
    LEVELS: 5,
    DICE_PER_PLAYER: 4,
    CODE_TARGETS: [8, 9, 10, 9, 10],
    LOCK_VALUES: [5, 6, 5, 6, 6],
    BALANCE_MAX_DIFF: 2,
    ALARM_MAX: 3,
    POINTS_PER_LEVEL: 200
  },

  // Runde 2 – Kongen på haugen
  R2: {
    QUESTIONS: 10,
    QUESTION_SECONDS: 15,
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
    POINTS_PER_WORD: 100
  },

  // Runde 5 – Hvor mange reiser seg?
  R5: {
    ROUNDS: 5,
    TIMER_SECONDS: 10,
    EXACT_POINTS: 300,
    OFF_BY_ONE_POINTS: 100
  },

  // Runde 6 – Lagduellen
  R6: {
    QUESTION_SECONDS: 12,
    DUEL_WINS_NEEDED: 3, // best av 5
    CHAMPION_POINTS: 500,
    TEAM_POINTS: 200
  },

  // Runde 7 – Allianse eller svik
  R7: {
    POT_PER_CORRECT: 100,
    MAX_GUESSES: 12,
    CHOICE_SECONDS: 20
  },

  // Runde 8 – Figurkamp
  R8: {
    HP: 12,
    EXCHANGES: 6,
    CHOICE_SECONDS: 10,
    WIN_POINTS: 400,
    BASE_ATTACK: 0,
    BASE_DEFENSE: 0,
    BLOCK_COUNTER_DAMAGE: 2
  },

  // Runde 9 – Lynrunden
  R9: {
    QUESTIONS: 15,
    QUESTION_SECONDS: 8,
    REVEAL_SECONDS: 3,
    CORRECT_POINTS: 100,
    MULTIPLIER: 2 // doble poeng for alle
  },

  // Runde 10 – Finale
  R10: {
    BASE_POT: 1000,
    POT_PER_CORRECT: 250,
    QUESTIONS: 8,
    QUESTION_SECONDS: 10,
    CHOICE_SECONDS: 30,
    SPECTATOR_BET_PAYOUT: 2 // riktig spådom gir innsats × dette i gevinst
  },

  // Live-oppdateringer
  HEARTBEAT_MS: 20000
};

/*
  Minirunde – Estimering.
  Spørsmål med tall som svar (enheten vises alltid). Bare tall godtas.
  Gjetningene vises først når alle har svart (eller tiden er ute), sortert etter hvor nær de var.
  Nærmest +300, nest nærmest +200, tredje +100. Likt avvik gir lik plassering.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { ESTIMATES } = require("../content-mini");
const { pick, randFloat } = require("../util");

const C = config.ESTIMAT;

class EstimateRound extends Round {
  start() {
    this.index = 0;
    this.nextQuestion();
  }

  nextQuestion() {
    if (this.index >= C.QUESTIONS) return this.finish();
    this.index++;
    let pool = ESTIMATES.filter(q => !this.game.usedContent.has(q));
    if (!pool.length) pool = ESTIMATES;
    this.q = pick(pool);
    this.game.usedContent.add(this.q);
    this.step = "answer"; // answer | reveal
    this.guesses = new Map();
    this.auto(() => this.reveal(), C.ANSWER_SECONDS);
    this.changed();
  }

  reveal() {
    if (this.step !== "answer") return;
    this.step = "reveal";
    const rows = [...this.guesses.entries()].map(([id, value]) => ({ id, name: this.name(id), value, diff: Math.abs(value - this.q.a) }))
      .sort((a, b) => a.diff - b.diff);
    // Konkurranseplassering: likt avvik gir lik plass (1, 1, 3 …)
    rows.forEach((row, i) => {
      row.place = i > 0 && row.diff === rows[i - 1].diff ? rows[i - 1].place : i + 1;
      row.points = C.PRIZES[row.place - 1] || 0;
      if (row.points) this.game.award(row.id, row.points);
    });
    this.rows = rows;
    this.auto(() => this.nextQuestion(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action !== "estimate") return super.playerAction(player, action);
    if (this.step !== "answer") throw new GameError("For sent.");
    const value = Number(String(data.value).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(value)) throw new GameError("Skriv inn et tall.");
    this.guesses.set(player.id, value);
    if (this.allIn(this.guesses)) this.reveal();
    this.changed();
  }

  hostAction(action) {
    if (action === "next") return this.step === "answer" ? this.reveal() : this.nextQuestion();
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step === "answer" && !this.guesses.has(bot.id) && this.chance(0.3)) {
      const guess = this.q.a * randFloat(0.5, 1.5);
      this.playerAction(bot, "estimate", { value: this.q.a < 20 ? Math.round(guess * 10) / 10 : Math.round(guess) });
    }
  }

  hostView() {
    return {
      type: "estimat",
      step: this.step,
      index: this.index,
      total: C.QUESTIONS,
      question: this.q.q,
      unit: this.q.unit,
      endsAt: this.step === "answer" ? this.autoAt : null,
      answered: this.guesses.size,
      totalPlayers: this.activeParticipants().length,
      answer: this.step === "reveal" ? this.q.a : null,
      rows: this.step === "reveal" ? this.rows.map(({ name, value, place, points }) => ({ name, value, place, points })) : null,
      actions: [],
      menu: [{ action: "next", label: this.step === "answer" ? "Avslør nå" : "Neste nå" }]
    };
  }

  playerView(player) {
    const mine = this.step === "reveal" ? this.rows.find(r => r.id === player.id) : null;
    return {
      type: "estimat",
      step: this.step,
      index: this.index,
      total: C.QUESTIONS,
      question: this.q.q,
      unit: this.q.unit,
      endsAt: this.step === "answer" ? this.autoAt : null,
      myGuess: this.guesses.has(player.id) ? this.guesses.get(player.id) : null,
      answer: this.step === "reveal" ? this.q.a : null,
      mine: mine ? { place: mine.place, points: mine.points } : null
    };
  }
}

module.exports = EstimateRound;

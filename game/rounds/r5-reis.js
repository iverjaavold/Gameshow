/*
  Runde 5 – Hvor mange reiser seg?
  Hemmelig gjetning, så Stå/Sitt med kort timer. Avsløres samtidig.
*/

const config = require("../config");
const { Round, GameError } = require("./base");

const C = config.R5;

class StandRound extends Round {
  start() {
    this.index = 0;
    this.history = [];
    this.nextTurn();
  }

  nextTurn() {
    this.index++;
    this.step = "guess"; // guess | stand | reveal
    this.guesses = new Map();
    this.choices = new Map();
    this.endsAt = null;
    this.result = null;
    this.changed();
  }

  startTimer() {
    if (this.step !== "guess") return;
    this.step = "stand";
    this.endsAt = Date.now() + C.TIMER_SECONDS * 1000;
    this.standTimer = this.timer(() => this.reveal(), C.TIMER_SECONDS * 1000);
    this.changed();
  }

  reveal() {
    if (this.step === "reveal") return;
    this.clearTimer(this.standTimer);
    this.step = "reveal";
    const ids = this.activeParticipants();
    const standing = ids.filter(id => this.choices.get(id) === true).length;
    const rows = ids.map(id => {
      const guess = this.guesses.has(id) ? this.guesses.get(id) : null;
      const diff = guess === null ? null : Math.abs(guess - standing);
      let points = 0;
      if (diff === 0) points = C.EXACT_POINTS;
      else if (diff === 1) points = C.OFF_BY_ONE_POINTS;
      if (points) this.game.award(id, points);
      return { id, name: this.name(id), guess, stood: this.choices.get(id) === true, hit: diff === 0 ? "exact" : diff === 1 ? "close" : null };
    });
    this.result = { standing, rows };
    this.history.push(standing);
    this.changed();
  }

  hostAction(action) {
    if (action === "startTimer") return this.startTimer();
    if (action === "reveal") return this.reveal();
    if (action === "next") {
      if (this.step !== "reveal") return this.reveal();
      if (this.index >= C.ROUNDS) return this.finish();
      return this.nextTurn();
    }
    return super.hostAction(action);
  }

  playerAction(player, action, data) {
    if (action === "guess") {
      if (this.step !== "guess") throw new GameError("Gjetningen er låst.");
      const value = Math.floor(Number(data.value));
      const max = this.participants.length;
      if (!Number.isFinite(value) || value < 0 || value > max) throw new GameError(`Gjett mellom 0 og ${max}.`);
      this.guesses.set(player.id, value);
      return this.changed();
    }
    if (action === "stand") {
      if (this.step !== "stand") throw new GameError("Vent på timeren.");
      this.choices.set(player.id, !!data.stand);
      return this.changed();
    }
    return super.playerAction(player, action);
  }

  hostView() {
    const ids = this.activeParticipants();
    const actions = [];
    if (this.step === "guess") actions.push({ action: "startTimer", label: "Start timeren" });
    if (this.step === "stand") actions.push({ action: "reveal", label: "Avslør nå" });
    if (this.step === "reveal") actions.push({ action: "next", label: this.index >= C.ROUNDS ? "Avslutt runden" : "Neste omgang" });
    return {
      type: "stand",
      index: this.index,
      total: C.ROUNDS,
      step: this.step,
      endsAt: this.endsAt,
      guessed: ids.filter(id => this.guesses.has(id)).length,
      totalPlayers: ids.length,
      result: this.step === "reveal" ? this.result : null,
      actions
    };
  }

  playerView(player) {
    return {
      type: "stand",
      index: this.index,
      total: C.ROUNDS,
      step: this.step,
      endsAt: this.endsAt,
      max: this.participants.length,
      myGuess: this.guesses.has(player.id) ? this.guesses.get(player.id) : null,
      myChoice: this.choices.has(player.id) ? this.choices.get(player.id) : null,
      result: this.step === "reveal" ? { standing: this.result.standing, mine: this.result.rows.find(r => r.id === player.id) || null } : null
    };
  }
}

module.exports = StandRound;

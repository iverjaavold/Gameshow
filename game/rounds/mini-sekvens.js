/*
  Minirunde – Husk sekvensen.
  Hovedskjermen viser en sekvens av farger. Alle gjentar den på mobilen.
  Sekvensen blir én lengre for hver runde. Bommer du (eller rekker det ikke), er du ute.
  Siste spiller igjen vinner. Poeng for hver runde du klarer, og bonus til vinneren.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { randInt, ms } = require("../util");

const C = config.SEKVENS;

class SequenceRound extends Round {
  start() {
    this.seq = [];
    for (let i = 0; i < C.START_LENGTH - 1; i++) this.seq.push(randInt(0, C.COLORS - 1));
    this.alive = new Set(this.activeParticipants());
    this.startCount = this.alive.size;
    this.out = new Map(); // spiller -> runde de røk ut
    this.level = 0;
    this.nextLevel();
  }

  nextLevel() {
    this.level++;
    this.seq.push(randInt(0, C.COLORS - 1));
    this.answers = new Map(); // spiller -> true/false
    this.step = "show"; // show | input | result | done
    this.showAt = this.game.now() + ms(C.LEAD_IN_SECONDS);
    const showMs = ms(C.LEAD_IN_SECONDS) + this.seq.length * ms(C.STEP_SECONDS);
    this.timer(() => this.startInput(), showMs / ms(1));
    this.autoAt = null;
    this.changed();
  }

  startInput() {
    if (this.step !== "show") return;
    this.step = "input";
    this.auto(() => this.result(), C.INPUT_BASE_SECONDS + this.seq.length * C.INPUT_PER_STEP_SECONDS);
    this.changed();
  }

  submit(player, seq) {
    if (this.step !== "input") throw new GameError("Vent til sekvensen er vist.");
    if (!this.alive.has(player.id)) throw new GameError("Du er ute.");
    if (this.answers.has(player.id)) return;
    const ok = Array.isArray(seq) && seq.length === this.seq.length && seq.every((c, i) => Number(c) === this.seq[i]);
    this.answers.set(player.id, ok);
    if (ok) this.game.award(player.id, C.POINTS_PER_LEVEL);
    if ([...this.alive].every(id => this.answers.has(id))) this.soon(() => this.result());
    this.changed();
    return ok;
  }

  result() {
    if (this.step !== "input") return;
    this.step = "result";
    const failed = [...this.alive].filter(id => this.answers.get(id) !== true);
    const survivors = [...this.alive].filter(id => this.answers.get(id) === true);
    this.lastFailed = failed;
    failed.forEach(id => this.out.set(id, this.level));
    // Røk alle ut samtidig, deler de seieren.
    const finished = this.startCount > 1 ? survivors.length <= 1 : survivors.length === 0;
    if (survivors.length) this.alive = new Set(survivors);
    if (finished || this.seq.length >= C.MAX_LENGTH) {
      this.winners = survivors.length ? survivors : failed;
      this.winners.forEach(id => this.game.award(id, C.WINNER_POINTS));
      this.lines.push(`Vinner: ${this.names(this.winners).join(", ")} (${this.seq.length} farger).`);
      this.step = "done";
      this.auto(() => this.finish(), C.REVEAL_SECONDS);
    } else {
      this.alive = new Set(survivors);
      this.auto(() => this.nextLevel(), C.RESULT_SECONDS);
    }
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "submit") return this.submit(player, data.seq);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") {
      if (this.step === "show") return this.startInput();
      if (this.step === "input") return this.result();
      if (this.step === "result") return this.nextLevel();
      return this.finish();
    }
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "input" || !this.alive.has(bot.id) || this.answers.has(bot.id) || !this.chance(0.2)) return;
    const right = this.chance(Math.pow(0.88, this.seq.length));
    this.submit(bot, right ? this.seq : this.seq.map(c => (c + 1) % C.COLORS));
  }

  playersView() {
    return this.activeParticipants().map(id => ({
      ...this.publicPlayer(id),
      out: this.out.has(id),
      done: this.answers.has(id) && this.alive.has(id),
      winner: !!(this.winners && this.winners.includes(id))
    }));
  }

  hostView() {
    const menu = [{ action: "next", label: this.step === "done" ? "Gå videre nå" : "Hopp videre" }];
    return {
      type: "sekvens",
      step: this.step,
      level: this.level,
      // Sekvensen vises bare mens den spilles av (og ved resultat)
      seq: this.step === "show" || this.step === "result" || this.step === "done" ? this.seq : null,
      showAt: this.showAt,
      stepMs: ms(C.STEP_SECONDS),
      endsAt: this.step === "input" ? this.autoAt : null,
      players: this.playersView(),
      failed: this.step === "result" ? this.names(this.lastFailed) : null,
      winners: this.winners ? this.names(this.winners) : null,
      actions: [],
      menu
    };
  }

  playerView(player) {
    return {
      type: "sekvens",
      step: this.step,
      level: this.level,
      length: this.seq.length,
      colors: C.COLORS,
      endsAt: this.step === "input" ? this.autoAt : null,
      alive: this.alive.has(player.id) && !this.out.has(player.id),
      answered: this.answers.has(player.id),
      correct: this.answers.get(player.id) === true,
      winner: !!(this.winners && this.winners.includes(player.id)),
      winners: this.winners ? this.names(this.winners) : null
    };
  }
}

module.exports = SequenceRound;

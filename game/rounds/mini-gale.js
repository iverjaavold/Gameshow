/*
  Minirunde – Kun gale svar.
  Spillerne får etter tur et enkelt spørsmål på hovedskjermen og må svare FEIL, høyt.
  Som sjakklokke: du trykker på knappen på mobilen idet du har sagt det gale svaret,
  og turen går videre til neste med et nytt spørsmål. Rekker du det ikke, er du ute.
  Hosten er dommer: sier noen det riktige svaret (eller noe som ikke er galt nok), trykker
  hosten «Ute!». Siste spiller igjen vinner.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { WRONG_ONLY } = require("../content-mini");
const { shuffle, pick } = require("../util");

const C = config.GALE;

class WrongOnlyRound extends Round {
  start() {
    this.order = shuffle(this.activeParticipants());
    this.alive = new Set(this.order);
    this.startCount = this.alive.size;
    this.pos = -1;
    this.turns = 0;
    this.eliminated = [];
    this.step = "ready"; // ready | turn | done
    this.auto(() => this.nextTurn(), C.READY_SECONDS);
    this.changed();
  }

  drawQuestion() {
    let pool = WRONG_ONLY.filter(q => !this.game.usedContent.has(q));
    if (!pool.length) pool = WRONG_ONLY;
    const q = pick(pool);
    this.game.usedContent.add(q);
    return q;
  }

  nextTurn() {
    if (this.step === "done") return;
    if (this.isOver()) return this.end();
    // Neste levende spiller i rekkefølgen
    do {
      this.pos = (this.pos + 1) % this.order.length;
    } while (!this.alive.has(this.order[this.pos]));
    this.currentId = this.order[this.pos];
    this.q = this.drawQuestion();
    this.turns++;
    this.step = "turn";
    this.auto(() => this.knockOut(this.currentId, "Tiden gikk ut"), C.TURN_SECONDS);
    this.changed();
  }

  isOver() {
    if (this.alive.size === 0) return true;
    if (this.startCount > 1 && this.alive.size <= 1) return true;
    return this.turns >= C.MAX_TURNS;
  }

  done(player) {
    if (this.step !== "turn" || player.id !== this.currentId) throw new GameError("Det er ikke din tur.");
    this.game.award(player.id, C.POINTS_PER_TURN);
    this.nextTurn();
  }

  knockOut(id, reason) {
    if (this.step !== "turn" || id !== this.currentId) return;
    this.alive.delete(id);
    this.eliminated.push(id);
    this.lastOut = `${this.name(id)} er ute! ${reason}.`;
    this.game.toast(this.player(id), `Du er ute! ${reason}.`);
    this.nextTurn();
  }

  end() {
    if (this.step === "done") return;
    this.step = "done";
    // Røk alle ut, vinner den som røk ut sist.
    this.winners = this.alive.size ? [...this.alive] : this.eliminated.slice(-1);
    this.winners.forEach(id => this.game.award(id, C.WINNER_POINTS));
    this.lines.push(`Vinner: ${this.names(this.winners).join(", ")}.`);
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action) {
    if (action === "done") return this.done(player);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "out") return this.knockOut(this.currentId, "Svaret var ikke galt nok");
    if (action === "pass") {
      if (this.step === "turn") this.nextTurn();
      return;
    }
    if (action === "next") {
      if (this.step === "ready") return this.nextTurn();
      if (this.step === "turn") return this.end();
      return this.finish();
    }
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "turn" || bot.id !== this.currentId || !this.chance(0.3)) return;
    this.done(bot);
  }

  hostView() {
    const actions = [];
    const menu = [];
    if (this.step === "turn") {
      actions.push({ action: "out", label: "Ute! (riktig svar)", style: "bad" });
      menu.push({ action: "pass", label: "Godkjenn og gå videre" });
      menu.push({ action: "next", label: "Avslutt leken nå" });
    } else {
      menu.push({ action: "next", label: this.step === "ready" ? "Start nå" : "Gå videre nå" });
    }
    return {
      type: "gale",
      step: this.step,
      endsAt: this.autoAt,
      question: this.step === "turn" ? this.q.q : null,
      answer: this.step === "turn" ? this.q.a : null,
      current: this.currentId && this.step === "turn" ? this.publicPlayer(this.currentId) : null,
      lastOut: this.lastOut || null,
      players: this.order.filter(id => this.game.players.has(id)).map(id => ({ ...this.publicPlayer(id), out: !this.alive.has(id) })),
      winners: this.winners ? this.names(this.winners) : null,
      actions,
      menu
    };
  }

  playerView(player) {
    return {
      type: "gale",
      step: this.step,
      endsAt: this.autoAt,
      myTurn: this.step === "turn" && this.currentId === player.id,
      question: this.step === "turn" && this.currentId === player.id ? this.q.q : null,
      currentName: this.currentId ? this.name(this.currentId) : null,
      alive: this.alive.has(player.id),
      winners: this.winners ? this.names(this.winners) : null
    };
  }
}

module.exports = WrongOnlyRound;

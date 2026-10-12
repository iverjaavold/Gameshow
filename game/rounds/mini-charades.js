/*
  Minirunde – Charades.
  Én spiller om gangen fremfører ord uten lyd – bare med kroppen – mens resten av rommet
  roper ut gjetninger. Ingen andre bruker telefonen. Hovedskjermen holder klokka og poengene.
  Fremføreren ser ordet på mobilen og trykker «Gjettet!» og velger hvem som gjettet,
  eller «Pass» for nytt ord. Både fremfører og den som gjettet får poeng.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { CHARADES } = require("../content-mini");
const { shuffle, pick } = require("../util");

const C = config.CHARADES;

class CharadesRound extends Round {
  start() {
    const ids = this.activeParticipants();
    this.order = shuffle(ids).slice(0, Math.min(C.TURNS_MAX, ids.length));
    this.turn = 0;
    this.results = []; // { performer, words }
    if (ids.length < 2) {
      this.step = "skip";
      this.lines.push("For få spillere – trenger minst 2.");
      return this.auto(() => this.finish(), 3);
    }
    this.nextTurn();
  }

  drawWord() {
    let pool = CHARADES.filter(w => !this.game.usedContent.has(w));
    if (!pool.length) pool = CHARADES;
    this.word = pick(pool);
    this.game.usedContent.add(this.word);
  }

  nextTurn() {
    if (this.turn >= this.order.length) return this.end();
    this.turn++;
    this.performerId = this.order[this.turn - 1];
    this.words = 0;
    this.passes = 0;
    this.lastGuess = null;
    this.drawWord();
    this.step = "ready"; // ready | play | turnOver | done
    this.auto(() => this.startPlay(), C.READY_SECONDS);
    this.changed();
  }

  startPlay() {
    if (this.step !== "ready") return;
    this.step = "play";
    this.auto(() => this.turnOver(), C.TURN_SECONDS);
    this.changed();
  }

  guessed(player, guesserId) {
    if (this.step !== "play" || player.id !== this.performerId) throw new GameError("Ikke din tur.");
    if (guesserId === player.id || !this.activeParticipants().includes(guesserId)) throw new GameError("Velg hvem som gjettet.");
    this.game.award(player.id, C.PERFORMER_POINTS);
    this.game.award(guesserId, C.GUESSER_POINTS);
    this.words++;
    this.lastGuess = `${this.name(guesserId)} gjettet «${this.word}»!`;
    this.drawWord();
    this.changed();
  }

  pass(player) {
    if (this.step !== "play" || player.id !== this.performerId) throw new GameError("Ikke din tur.");
    if (this.passes >= C.MAX_PASSES) throw new GameError(`Du kan bare passe ${C.MAX_PASSES} ganger.`);
    this.passes++;
    this.lastGuess = `Pass – «${this.word}» var for vanskelig.`;
    this.drawWord();
    this.changed();
  }

  turnOver() {
    if (this.step !== "play") return;
    this.step = "turnOver";
    this.results.push({ performer: this.performerId, words: this.words });
    this.auto(() => this.nextTurn(), C.TURN_OVER_SECONDS);
    this.changed();
  }

  end() {
    this.step = "done";
    const best = this.results.slice().sort((a, b) => b.words - a.words)[0];
    if (best) this.lines.push(`Flest ord: ${this.name(best.performer)} (${best.words}).`);
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "start") {
      if (player.id === this.performerId) this.startPlay();
      return;
    }
    if (action === "guessed") return this.guessed(player, data.guesser);
    if (action === "pass") return this.pass(player);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") {
      if (this.step === "ready") return this.startPlay();
      if (this.step === "play") return this.turnOver();
      if (this.step === "turnOver") return this.nextTurn();
      return this.finish();
    }
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "play" || bot.id !== this.performerId || !this.chance(0.08)) return;
    const others = this.activeParticipants().filter(id => id !== bot.id);
    if (others.length) this.guessed(bot, pick(others));
  }

  hostView() {
    const menu = [{ action: "next", label: { ready: "Start nå", play: "Avslutt turen nå", turnOver: "Neste nå" }[this.step] || "Gå videre nå" }];
    return {
      type: "charades",
      step: this.step,
      turn: this.turn,
      turns: this.order.length,
      endsAt: this.autoAt,
      performer: this.performerId ? this.publicPlayer(this.performerId) : null,
      words: this.words,
      lastGuess: this.lastGuess,
      results: this.results.map(r => ({ name: this.name(r.performer), words: r.words })),
      actions: [],
      menu
    };
  }

  playerView(player) {
    const performer = player.id === this.performerId;
    return {
      type: "charades",
      step: this.step,
      endsAt: this.autoAt,
      performer,
      performerName: this.performerId ? this.name(this.performerId) : null,
      word: performer && this.step === "play" ? this.word : null,
      words: this.words,
      passesLeft: C.MAX_PASSES - this.passes,
      others: performer ? this.activeParticipants().filter(id => id !== player.id).map(id => ({ id, name: this.name(id) })) : []
    };
  }
}

module.exports = CharadesRound;

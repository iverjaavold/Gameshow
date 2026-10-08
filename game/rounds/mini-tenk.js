/*
  Minirunde – Tenk likt.
  En kategori vises. Alle skriver det de tror flest andre skriver.
  100 poeng for hver annen spiller som skrev det samme. Like svar slås sammen automatisk
  (store/små bokstaver, mellomrom og små skrivefeil ignoreres, se game/text.js).
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { TENK_PROMPTS } = require("../content-mini");
const { pick } = require("../util");
const text = require("../text");

const C = config.TENK;

class ThinkAlikeRound extends Round {
  start() {
    this.index = 0;
    this.nextPrompt();
  }

  nextPrompt() {
    if (this.index >= C.PROMPTS) return this.finish();
    this.index++;
    let pool = TENK_PROMPTS.filter(p => !this.game.usedContent.has(p));
    if (!pool.length) pool = TENK_PROMPTS;
    this.prompt = pick(pool);
    this.game.usedContent.add(this.prompt);
    this.step = "answer"; // answer | reveal
    this.answers = new Map();
    this.groups = null;
    this.auto(() => this.reveal(), C.ANSWER_SECONDS);
    this.changed();
  }

  reveal() {
    if (this.step !== "answer") return;
    this.step = "reveal";
    const items = [...this.answers.entries()].map(([id, t]) => ({ id, text: t }));
    this.groups = text.group(items).sort((a, b) => b.ids.length - a.ids.length);
    this.groups.forEach(g => {
      const points = (g.ids.length - 1) * C.POINTS_PER_MATCH;
      if (points) g.ids.forEach(id => this.game.award(id, points));
    });
    this.auto(() => this.nextPrompt(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action !== "answer") return super.playerAction(player, action);
    if (this.step !== "answer") throw new GameError("For sent.");
    const answer = String(data.text || "").trim().slice(0, 40);
    if (!text.normalize(answer)) throw new GameError("Skriv et svar.");
    this.answers.set(player.id, answer);
    if (this.allIn(this.answers)) this.reveal();
    this.changed();
  }

  hostAction(action) {
    if (action === "next") return this.step === "answer" ? this.reveal() : this.nextPrompt();
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step === "answer" && !this.answers.has(bot.id) && this.chance(0.3)) {
      this.playerAction(bot, "answer", { text: pick(this.prompt.ex) });
    }
  }

  groupView() {
    return this.groups.map(g => ({ label: g.label, names: this.names(g.ids), count: g.ids.length }));
  }

  hostView() {
    return {
      type: "tenk",
      step: this.step,
      index: this.index,
      total: C.PROMPTS,
      prompt: this.prompt.p,
      endsAt: this.step === "answer" ? this.autoAt : null,
      answered: this.answers.size,
      totalPlayers: this.activeParticipants().length,
      groups: this.step === "reveal" ? this.groupView() : null,
      actions: [],
      menu: [{ action: "next", label: this.step === "answer" ? "Avslør nå" : "Neste nå" }]
    };
  }

  playerView(player) {
    const mine = this.answers.get(player.id) || null;
    let matches = null;
    if (this.step === "reveal" && mine) {
      const g = this.groups.find(x => x.ids.includes(player.id));
      matches = g ? g.ids.length - 1 : 0;
    }
    return {
      type: "tenk",
      step: this.step,
      index: this.index,
      total: C.PROMPTS,
      prompt: this.prompt.p,
      endsAt: this.step === "answer" ? this.autoAt : null,
      myAnswer: mine,
      matches,
      points: matches === null ? null : matches * C.POINTS_PER_MATCH
    };
  }
}

module.exports = ThinkAlikeRound;

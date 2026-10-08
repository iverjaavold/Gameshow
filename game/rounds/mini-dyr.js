/*
  Minirunde – Hvem er hvilket dyr?
  1. Alle skriver et dyr i hemmelighet.
  2. Appen legger til ett ekstra dyr (lokkedue) som ingen har skrevet. Listen vises i 15 sekunder.
  3. Alle kobler de andre spillerne til et dyr på mobilen. Ett dyr blir til overs.
  4. Fasiten avsløres automatisk: 100 poeng per riktig kobling.
  Skrev to spillere samme dyr, er det ett dyr i listen, og koblingen godtas for begge.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { ANIMALS } = require("../content-mini");
const { shuffle, pick } = require("../util");
const text = require("../text");

const C = config.DYR;

class AnimalRound extends Round {
  start() {
    this.step = "write"; // write | show | match | reveal
    this.animals = new Map(); // spiller -> skrevet dyr
    this.matches = new Map(); // spiller -> { målspiller: dyr-nøkkel }
    this.done = new Set(); // har sendt inn koblingene
    this.auto(() => this.toShow(), C.WRITE_SECONDS);
    this.changed();
  }

  writers() {
    return this.activeParticipants().filter(id => this.animals.has(id));
  }

  toShow() {
    if (this.step !== "write") return;
    // Ett dyr per unikt svar (like svar slås sammen)
    this.items = [];
    this.writers().forEach(id => {
      const animal = this.animals.get(id);
      const key = text.normalize(animal);
      let item = this.items.find(it => text.sameNormalized(it.key, key));
      if (!item) {
        item = { key, label: capitalize(animal), ids: [] };
        this.items.push(item);
      }
      item.ids.push(id);
    });
    const decoys = ANIMALS.filter(a => !this.items.some(it => text.sameNormalized(it.key, text.normalize(a))));
    const decoy = pick(decoys.length ? decoys : ANIMALS);
    this.items.push({ key: text.normalize(decoy), label: decoy, ids: [], decoy: true });
    this.items = shuffle(this.items).map((it, i) => ({ ...it, n: i }));

    if (this.writers().length < 2) {
      this.lines = ["For få skrev et dyr – ingen kobling denne gangen."];
      return this.reveal();
    }
    this.step = "show";
    this.auto(() => this.toMatch(), C.SHOW_SECONDS);
    this.changed();
  }

  toMatch() {
    this.step = "match";
    this.auto(() => this.reveal(), C.MATCH_SECONDS);
    this.changed();
  }

  // Dyret jeg selv skrev (som jeg ikke skal koble), med mindre noen andre skrev det samme
  ownItem(playerId) {
    const item = this.items.find(it => it.ids.includes(playerId));
    return item && item.ids.length === 1 ? item.n : null;
  }

  reveal() {
    if (this.step === "reveal") return;
    this.step = "reveal";
    this.scores = this.activeParticipants().map(id => {
      const mine = this.matches.get(id) || {};
      let correct = 0;
      Object.entries(mine).forEach(([target, n]) => {
        const item = this.items[n];
        if (item && item.ids.includes(target) && target !== id) correct++;
      });
      if (correct) this.game.award(id, correct * C.POINTS_PER_MATCH);
      return { id, name: this.name(id), correct };
    }).sort((a, b) => b.correct - a.correct);
    if (this.scores.length) this.lines.push(`Flest riktige: ${this.scores[0].name} (${this.scores[0].correct}).`);
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "animal") {
      if (this.step !== "write") throw new GameError("For sent å skrive dyr.");
      const animal = String(data.text || "").trim().slice(0, 30);
      if (!text.normalize(animal)) throw new GameError("Skriv et dyr.");
      this.animals.set(player.id, animal);
      if (this.allIn(this.animals)) this.soon(() => this.toShow());
      return this.changed();
    }
    if (action === "match") {
      if (this.step !== "match") throw new GameError("Ikke tid for å koble.");
      const target = String(data.target);
      if (target === player.id || !this.writers().includes(target)) throw new GameError("Ugyldig spiller.");
      const n = data.item === null || data.item === "" ? null : Number(data.item);
      if (n !== null && (!this.items[n] || n === this.ownItem(player.id))) throw new GameError("Ugyldig dyr.");
      const mine = { ...(this.matches.get(player.id) || {}) };
      if (n === null) delete mine[target];
      else mine[target] = n;
      this.matches.set(player.id, mine);
      return this.changed();
    }
    if (action === "doneMatching") {
      if (this.step !== "match") return;
      this.done.add(player.id);
      if (this.allIn(this.done)) this.auto(() => this.reveal(), 1);
      return this.changed();
    }
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") {
      if (this.step === "write") return this.toShow();
      if (this.step === "show") return this.toMatch();
      if (this.step === "match") return this.reveal();
      return this.finish();
    }
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step === "write" && !this.animals.has(bot.id) && this.chance(0.3)) {
      this.playerAction(bot, "animal", { text: pick(ANIMALS) });
    }
    if (this.step === "match" && !this.done.has(bot.id) && this.chance(0.3)) {
      const own = this.ownItem(bot.id);
      const options = this.items.filter(it => it.n !== own);
      this.writers().filter(id => id !== bot.id).forEach(target => {
        this.playerAction(bot, "match", { target, item: pick(options).n });
      });
      this.playerAction(bot, "doneMatching", {});
    }
  }

  publicItems() {
    return this.items ? this.items.map(it => ({ n: it.n, label: it.label })) : [];
  }

  hostView() {
    const ids = this.activeParticipants();
    const view = {
      type: "dyr",
      step: this.step,
      endsAt: this.autoAt,
      written: this.animals.size,
      matched: this.done.size,
      totalPlayers: ids.length,
      items: this.step === "write" ? [] : this.publicItems(),
      actions: [],
      menu: [{ action: "next", label: "Gå videre nå" }]
    };
    if (this.step === "reveal") {
      view.answers = this.items.map(it => ({ label: it.label, decoy: !!it.decoy, names: this.names(it.ids) }));
      view.scores = this.scores.map(s => ({ name: s.name, correct: s.correct }));
    }
    return view;
  }

  playerView(player) {
    const view = {
      type: "dyr",
      step: this.step,
      endsAt: this.autoAt,
      myAnimal: this.animals.get(player.id) || null,
      items: this.step === "write" ? [] : this.publicItems()
    };
    if (this.step === "match") {
      const own = this.ownItem(player.id);
      view.choices = this.publicItems().filter(it => it.n !== own);
      view.targets = this.writers().filter(id => id !== player.id).map(id => ({ id, name: this.name(id) }));
      view.myMatches = this.matches.get(player.id) || {};
      view.done = this.done.has(player.id);
    }
    if (this.step === "reveal") {
      const me = this.scores.find(s => s.id === player.id);
      view.correct = me ? me.correct : 0;
      view.answers = this.items.map(it => ({ label: it.label, decoy: !!it.decoy, names: this.names(it.ids) }));
    }
    return view;
  }
}

function capitalize(s) {
  s = String(s).trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = AnimalRound;

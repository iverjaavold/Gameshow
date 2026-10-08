/*
  Runde 8 – Figurkamp. [ÅPENT i spesifikasjonen – enkel, utskiftbar versjon]
  Alle dueller går samtidig. Hver runde velger begge «Angrip» eller «Forsvar» i hemmelighet.
    Angrip mot angrip: begge tar skade (terning + angrep − motstanderens forsvar, minst 1).
    Angrip mot forsvar: skade = angrepskast − forsvarskast. Blokkeres alt, får angriperen motangrep.
    Forsvar mot forsvar: begge får 1 liv tilbake.
  Sverd gir angrep, skjold gir forsvar. Mest liv etter siste runde vinner. Alt går av seg selv.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { rollDie, pick } = require("../util");

const C = config.R8;

class FightRound extends Round {
  start() {
    const choice = this.options.leaderChoice;
    const fixed = Array.isArray(choice) && choice.every(id => this.participants.includes(id)) ? [choice] : [];
    const groups = this.game.randomizer.pairs(this.participants, fixed);
    this.duels = [];
    groups.forEach(g => {
      if (g.length === 2) this.duels.push(this.makeDuel(g[0], g[1], []));
      if (g.length === 3) {
        this.duels.push(this.makeDuel(g[0], g[1], []));
        this.duels.push(this.makeDuel(g[2], g[0], [g[0]])); // g[0] kjemper to ganger, poeng bare første gang
      }
    });
    this.exchange = 0;
    this.choices = new Map();
    this.nextExchange();
  }

  makeDuel(a, b, noPoints) {
    return { fighters: [this.makeFighter(a), this.makeFighter(b)], noPoints, log: [], done: false, winner: null };
  }

  makeFighter(id) {
    const up = this.player(id).upgrades;
    return {
      id,
      hp: C.HP,
      atk: C.BASE_ATTACK + up.sword * config.UPGRADE_SWORD_ATTACK,
      def: C.BASE_DEFENSE + up.shield * config.UPGRADE_SHIELD_DEFENSE
    };
  }

  activeFighterIds() {
    const ids = new Set();
    this.duels.filter(d => !d.done).forEach(d => d.fighters.forEach(f => ids.add(f.id)));
    return [...ids];
  }

  nextExchange() {
    this.exchange++;
    this.step = "choose";
    this.choices.clear();
    this.auto(() => this.resolve(), C.CHOICE_SECONDS);
    this.changed();
  }

  resolve() {
    if (this.step !== "choose") return;
    this.step = "result";
    this.duels.filter(d => !d.done).forEach(duel => this.resolveDuel(duel));

    if (this.duels.every(d => d.done)) {
      this.step = "done";
      this.awardWinners();
      this.auto(() => this.finish(), C.RESULT_SECONDS * 2);
    } else {
      this.auto(() => this.nextExchange(), C.RESULT_SECONDS);
    }
    this.changed();
  }

  awardWinners() {
    this.duels.forEach(d => {
      if (!d.noPoints.includes(d.winner)) this.game.award(d.winner, C.WIN_POINTS);
      this.lines.push(`${this.name(d.winner)} vant mot ${this.name(d.fighters.find(f => f.id !== d.winner).id)}!`);
    });
  }

  resolveDuel(duel) {
    const [a, b] = duel.fighters;
    const ca = this.choices.get(a.id) || "attack";
    const cb = this.choices.get(b.id) || "attack";
    const text = [];

    if (ca === "attack" && cb === "attack") {
      const dmgB = Math.max(1, rollDie() + a.atk - b.def);
      const dmgA = Math.max(1, rollDie() + b.atk - a.def);
      b.hp -= dmgB;
      a.hp -= dmgA;
      text.push(`Begge angriper! ${this.name(a.id)} gjør ${dmgB} skade, ${this.name(b.id)} gjør ${dmgA}.`);
    } else if (ca === "defend" && cb === "defend") {
      a.hp = Math.min(C.HP, a.hp + 1);
      b.hp = Math.min(C.HP, b.hp + 1);
      text.push("Begge forsvarer seg og henter seg inn (+1 liv).");
    } else {
      const [att, def] = ca === "attack" ? [a, b] : [b, a];
      const dmg = Math.max(0, rollDie() + att.atk - (rollDie() + def.def));
      if (dmg > 0) {
        def.hp -= dmg;
        text.push(`${this.name(att.id)} angriper og gjør ${dmg} skade gjennom forsvaret!`);
      } else {
        att.hp -= C.BLOCK_COUNTER_DAMAGE;
        text.push(`${this.name(def.id)} blokkerer alt og slår tilbake (${C.BLOCK_COUNTER_DAMAGE} skade)!`);
      }
    }

    duel.last = { choices: [ca, cb], text: text.join(" ") };
    duel.log.push(duel.last.text);

    if (a.hp <= 0 || b.hp <= 0 || this.exchange >= C.EXCHANGES) {
      duel.done = true;
      duel.winner = winnerOf(a, b);
    }
  }

  forceEnd() {
    if (this.step !== "done") {
      // Avbrutt: den med mest liv vinner hver uferdige duell.
      this.duels.filter(d => !d.done).forEach(d => {
        d.done = true;
        d.winner = winnerOf(d.fighters[0], d.fighters[1]);
      });
      this.awardWinners();
    }
    this.finish();
  }

  hostAction(action) {
    if (action === "resolve") return this.resolve();
    if (action === "next") {
      if (this.step === "done") return this.finish();
      if (this.step === "result") return this.nextExchange();
      return this.resolve();
    }
    return super.hostAction(action);
  }

  playerAction(player, action, data) {
    if (action !== "choose") return super.playerAction(player, action);
    if (this.step !== "choose") throw new GameError("Vent på neste runde.");
    if (!this.activeFighterIds().includes(player.id)) throw new GameError("Kampen din er ferdig.");
    if (data.choice !== "attack" && data.choice !== "defend") throw new GameError("Ugyldig valg.");
    this.choices.set(player.id, data.choice);
    if (this.activeFighterIds().every(id => this.choices.has(id))) this.resolve();
    this.changed();
  }

  botAct(bot) {
    if (this.step === "choose" && !this.choices.has(bot.id) && this.activeFighterIds().includes(bot.id) && this.chance(0.4)) {
      this.playerAction(bot, "choose", { choice: this.chance(0.6) ? "attack" : "defend" });
    }
  }

  duelView(d) {
    return {
      fighters: d.fighters.map(f => ({ ...this.publicPlayer(f.id), hp: f.hp, maxHp: C.HP, atk: f.atk, def: f.def })),
      last: d.last || null,
      done: d.done,
      winnerName: d.done ? this.name(d.winner) : null
    };
  }

  hostView() {
    const active = this.activeFighterIds();
    const menu = [];
    if (this.step === "choose") menu.push({ action: "resolve", label: "Avgjør nå" });
    else menu.push({ action: "next", label: "Gå videre nå" });
    return {
      type: "fight",
      step: this.step,
      exchange: this.exchange,
      exchanges: C.EXCHANGES,
      endsAt: this.step === "choose" ? this.autoAt : null,
      chosen: active.filter(id => this.choices.has(id)).length,
      totalFighters: active.length,
      duels: this.duels.map(d => this.duelView(d)),
      actions: [],
      menu
    };
  }

  playerView(player) {
    const mine = this.duels.filter(d => d.fighters.some(f => f.id === player.id));
    const active = this.activeFighterIds().includes(player.id);
    return {
      type: "fight",
      step: this.step,
      exchange: this.exchange,
      exchanges: C.EXCHANGES,
      endsAt: this.step === "choose" ? this.autoAt : null,
      active,
      myChoice: this.choices.get(player.id) || null,
      duels: mine.map(d => this.duelView(d)),
      myId: player.id
    };
  }
}

function winnerOf(a, b) {
  if (a.hp === b.hp) return pick([a.id, b.id]);
  return a.hp > b.hp ? a.id : b.id;
}

module.exports = FightRound;

/*
  Felles grunnlag for alle runder og minirunder.
  En runde får spillmotoren, spill-id, deltakerne (snapshot ved start) og valg
  (lederens makt / faste lag). Den kaller this.finish() når den er ferdig.

  Hosten skal gjøre minst mulig:
  - hostView().actions = knapper hosten MÅ ha (grønn/rød der et menneske vurderer).
  - hostView().menu    = manuelle overstyringer, gjemt bak «⋯».
  - this.auto(fn, sek) = går videre av seg selv. Nedtellingen vises på skjermen.
*/

const config = require("../config");
const { GameError, ms } = require("../util");

class Round {
  constructor(game, id, participants, options = {}) {
    this.game = game;
    this.id = id;
    this.participants = participants;
    this.options = options;
    this.ended = false;
    this.lines = []; // oppsummering for hovedskjermen
    this.autoTimer = null;
    this.autoAt = null;
  }

  start() {}

  hostAction(action) {
    throw new GameError(`Ukjent handling: ${action}`);
  }

  playerAction(player, action) {
    throw new GameError(`Ukjent handling: ${action}`);
  }

  // Testmodus: hva en bot gjør. Kalles jevnlig for hver bot som er med.
  botAct() {}

  hostView() {
    return {};
  }

  playerView() {
    return {};
  }

  summary() {
    return this.lines;
  }

  finish() {
    if (this.ended) return;
    this.ended = true;
    this.cancelAuto();
    this.game.endRound();
  }

  forceEnd() {
    this.finish();
  }

  // ---------- Tid ----------

  timer(fn, seconds) {
    return this.game.roundTimer(() => {
      if (!this.ended) fn();
    }, ms(seconds));
  }

  clearTimer(t) {
    this.game.clearRoundTimer(t);
  }

  // Går videre av seg selv etter så mange sekunder (erstatter forrige automatikk).
  auto(fn, seconds) {
    this.cancelAuto();
    this.autoAt = this.game.now() + ms(seconds);
    this.autoTimer = this.timer(() => {
      this.autoTimer = null;
      this.autoAt = null;
      fn();
    }, seconds);
  }

  cancelAuto() {
    this.clearTimer(this.autoTimer);
    this.autoTimer = null;
    this.autoAt = null;
    this.soonPending = false;
  }

  // Når alle har svart: gå videre etter en kort pause. Startes bare én gang,
  // så nye endringer (f.eks. et endret bud) ikke kan utsette den i det uendelige.
  soon(fn) {
    if (this.soonPending) return;
    this.auto(fn, config.ALL_DONE_DELAY_SECONDS);
    this.soonPending = true;
  }

  // Tidspunkt (server-tid) så mange sekunder fram i tid
  at(seconds) {
    return this.game.now() + ms(seconds);
  }

  // ---------- Hjelpere ----------

  name(id) {
    const p = this.game.getPlayer(id);
    return p ? p.name : "?";
  }

  names(ids) {
    return ids.map(id => this.name(id));
  }

  player(id) {
    return this.game.getPlayer(id);
  }

  publicPlayer(id) {
    const p = this.game.getPlayer(id);
    return p ? this.game.publicPlayer(p) : { id, name: "?", figure: {}, upgrades: {} };
  }

  activeParticipants() {
    return this.participants.filter(id => this.game.players.has(id));
  }

  // Har alle aktive deltakere gjort noe? (set/map med spiller-id som nøkkel)
  allIn(collection, ids = this.activeParticipants()) {
    return ids.length > 0 && ids.every(id => collection.has(id));
  }

  // Bot-hjelper: gjør noe med en viss sannsynlighet per «tanke»
  chance(p) {
    return Math.random() < p;
  }

  changed() {
    this.game.changed();
  }
}

module.exports = { Round, GameError };

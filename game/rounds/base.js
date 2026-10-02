/*
  Felles grunnlag for alle runder.
  En runde får spillmotoren, rundenummer, deltakerne (snapshot ved start) og valg
  (lederens makt / faste lag). Den kaller this.finish() når den er ferdig.
*/

const { GameError } = require("../util");

class Round {
  constructor(game, number, participants, options = {}) {
    this.game = game;
    this.number = number;
    this.participants = participants;
    this.options = options;
    this.ended = false;
    this.lines = []; // oppsummering for hovedskjermen
  }

  start() {}

  hostAction(action) {
    throw new GameError(`Ukjent handling: ${action}`);
  }

  playerAction(player, action) {
    throw new GameError(`Ukjent handling: ${action}`);
  }

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
    this.game.endRound();
  }

  forceEnd() {
    this.finish();
  }

  // Hjelpere
  timer(fn, ms) {
    return this.game.roundTimer(() => {
      if (!this.ended) fn();
    }, ms);
  }

  clearTimer(t) {
    this.game.clearRoundTimer(t);
  }

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

  changed() {
    this.game.changed();
  }
}

module.exports = { Round, GameError };

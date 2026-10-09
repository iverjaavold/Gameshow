/*
  Minirunde – Blunke-mafia. Anbefalt 5+ deltakere.
  Én tilfeldig spiller blir i hemmelighet mafia (vises bare på egen mobil).
  Mafiaen dreper ved å blunke med ett øye til noen. Den som blir blunket til, venter litt,
  dør dramatisk og trykker «Jeg ble drept» på mobilen.
  Levende borgere kan anklage noen. Riktig: borgerne vinner. Feil: den som anklaget, er ute.
  Mafiaen vinner hvis tiden går ut, eller hvis det bare er én borger igjen.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { pick } = require("../util");

const C = config.MAFIA;

class WinkMafiaRound extends Round {
  start() {
    const ids = this.activeParticipants();
    this.dead = new Map(); // spiller -> "killed" | "wrong"
    this.kills = 0;
    this.events = [];
    if (ids.length < C.MIN_PLAYERS) {
      this.step = "reveal";
      this.mafiaId = null;
      this.result = `For få spillere – Blunke-mafia trenger minst ${C.MIN_PLAYERS}.`;
      this.lines.push(this.result);
      this.auto(() => this.finish(), C.REVEAL_SECONDS);
      return this.changed();
    }
    this.mafiaId = pick(ids);
    this.step = "roles"; // roles | play | reveal
    this.auto(() => this.startPlay(), C.ROLE_SECONDS);
    this.changed();
  }

  startPlay() {
    if (this.step !== "roles") return;
    this.step = "play";
    this.auto(() => this.end("timeout"), C.PLAY_SECONDS);
    this.changed();
  }

  alive() {
    return this.activeParticipants().filter(id => !this.dead.has(id));
  }

  aliveCitizens() {
    return this.alive().filter(id => id !== this.mafiaId);
  }

  isAlive(id) {
    return this.participants.includes(id) && !this.dead.has(id);
  }

  killed(player) {
    if (this.step !== "play") throw new GameError("Leken er ikke i gang.");
    if (player.id === this.mafiaId) throw new GameError("Mafiaen kan ikke dø av et blunk.");
    if (!this.isAlive(player.id)) return;
    this.dead.set(player.id, "killed");
    this.kills++;
    this.events.push(`💀 ${player.name} er drept!`);
    this.checkEnd();
    this.changed();
  }

  accuse(player, targetId) {
    if (this.step !== "play") throw new GameError("Leken er ikke i gang.");
    if (!this.isAlive(player.id)) throw new GameError("Døde kan ikke anklage.");
    if (player.id === this.mafiaId) throw new GameError("Mafiaen kan ikke anklage.");
    if (targetId === player.id || !this.isAlive(targetId)) throw new GameError("Velg en annen levende spiller.");
    if (targetId === this.mafiaId) {
      this.accuserId = player.id;
      this.events.push(`☝️ ${player.name} anklaget ${this.name(targetId)} – RIKTIG!`);
      return this.end("caught");
    }
    this.dead.set(player.id, "wrong");
    this.events.push(`☝️ ${player.name} anklaget ${this.name(targetId)} – feil! ${player.name} er ute.`);
    this.checkEnd();
    this.changed();
  }

  checkEnd() {
    if (this.step === "play" && this.aliveCitizens().length <= 1) this.end("allDead");
  }

  end(reason) {
    if (this.step !== "play") return;
    this.step = "reveal";
    const mafia = this.name(this.mafiaId);
    if (reason === "caught") {
      this.mafiaWon = false;
      this.game.award(this.accuserId, C.CATCH_POINTS);
      this.aliveCitizens().filter(id => id !== this.accuserId).forEach(id => this.game.award(id, C.SURVIVOR_POINTS));
      this.result = `${this.name(this.accuserId)} avslørte mafiaen: ${mafia}!`;
    } else {
      this.mafiaWon = true;
      this.game.award(this.mafiaId, C.MAFIA_WIN_POINTS);
      this.result = reason === "timeout"
        ? `Tiden er ute! Mafiaen ${mafia} slapp unna.`
        : `Mafiaen ${mafia} tok nesten alle!`;
    }
    if (this.kills) this.game.award(this.mafiaId, this.kills * C.KILL_POINTS);
    this.lines.push(this.result);
    this.lines.push(`${mafia} drepte ${this.kills} med blunk.`);
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "killed") return this.killed(player);
    if (action === "accuse") return this.accuse(player, data.target);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") {
      if (this.step === "roles") return this.startPlay();
      if (this.step === "play") return this.end("timeout");
      return this.finish();
    }
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "play" || !this.isAlive(bot.id) || bot.id === this.mafiaId) return;
    if (this.chance(0.03)) return this.killed(bot);
    if (this.chance(0.005)) {
      const others = this.alive().filter(id => id !== bot.id);
      if (others.length) this.accuse(bot, pick(others));
    }
  }

  playersView() {
    return this.activeParticipants().map(id => ({ ...this.publicPlayer(id), dead: this.dead.get(id) || null }));
  }

  hostView() {
    const menu = [];
    if (this.step === "roles") menu.push({ action: "next", label: "Start nå" });
    if (this.step === "play") menu.push({ action: "next", label: "Avslutt (mafiaen vinner)" });
    if (this.step === "reveal") menu.push({ action: "next", label: "Gå videre nå" });
    return {
      type: "mafia",
      step: this.step,
      endsAt: this.autoAt,
      players: this.playersView(),
      events: this.events.slice(-4),
      mafia: this.step === "reveal" && this.mafiaId ? this.publicPlayer(this.mafiaId) : null,
      mafiaWon: this.mafiaWon,
      result: this.step === "reveal" ? this.result : null,
      actions: [],
      menu
    };
  }

  playerView(player) {
    const isMafia = player.id === this.mafiaId;
    return {
      type: "mafia",
      step: this.step,
      endsAt: this.autoAt,
      isMafia,
      alive: this.isAlive(player.id),
      deadHow: this.dead.get(player.id) || null,
      kills: isMafia ? this.kills : null,
      targets: this.step === "play" && !isMafia && this.isAlive(player.id)
        ? this.alive().filter(id => id !== player.id).map(id => ({ id, name: this.name(id) }))
        : [],
      mafiaName: this.step === "reveal" && this.mafiaId ? this.name(this.mafiaId) : null,
      result: this.step === "reveal" ? this.result : null
    };
  }
}

module.exports = WinkMafiaRound;

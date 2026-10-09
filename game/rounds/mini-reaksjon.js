/*
  Minirunde – Reaksjonstest (F1-start).
  Fem røde lys tennes ett og ett (1 sekund mellom). 3–6 sekunder etter siste lys slukker alle samtidig.
  Serveren sender tidspunktene på forhånd, så hovedskjermen og alle mobiler slukker samtidig.
  Reaksjonstiden MÅLES PÅ MOBILEN (fra lysene slukker på mobilskjermen til trykket),
  så nettverksforsinkelse ikke påvirker resultatet. Tyvstart: −100.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { ms, randFloat, randInt } = require("../util");

const C = config.REAKSJON;
const MAX_REACTION_MS = 5000;

class ReactionRound extends Round {
  start() {
    this.step = "running"; // running | reveal
    this.lightsAt = this.at(C.LEAD_IN_SECONDS);
    this.lightMs = ms(C.LIGHT_INTERVAL_SECONDS);
    const lastLight = this.lightsAt + this.lightMs * (C.LIGHTS - 1);
    this.outAt = lastLight + ms(randFloat(C.MIN_WAIT_SECONDS, C.MAX_WAIT_SECONDS));
    this.reports = new Map(); // spiller -> { ms } eller { falseStart: true }
    this.auto(() => this.reveal(), (this.outAt - this.game.now()) / ms(1) + C.REPORT_SECONDS);
    this.changed();
  }

  report(player, data) {
    if (this.step !== "running") throw new GameError("For sent.");
    if (this.reports.has(player.id)) return;
    // Kommer trykket før lysene har slukket (med litt slingringsmonn), er det tyvstart uansett.
    const early = this.game.now() < this.outAt - 150;
    if (data.falseStart || early) {
      this.reports.set(player.id, { falseStart: true });
    } else {
      const reaction = Math.round(Number(data.ms));
      if (!Number.isFinite(reaction) || reaction < 0 || reaction > MAX_REACTION_MS) throw new GameError("Ugyldig tid.");
      this.reports.set(player.id, { ms: reaction });
    }
    if (this.allIn(this.reports)) this.auto(() => this.reveal(), 1);
    this.changed();
  }

  reveal() {
    if (this.step === "reveal") return;
    this.step = "reveal";
    const ids = this.activeParticipants();
    const valid = ids.filter(id => this.reports.has(id) && !this.reports.get(id).falseStart)
      .sort((a, b) => this.reports.get(a).ms - this.reports.get(b).ms);
    const points = new Map();
    valid.slice(0, C.PRIZES.length).forEach((id, i) => points.set(id, C.PRIZES[i]));
    ids.forEach(id => {
      const r = this.reports.get(id);
      if (r && r.falseStart) points.set(id, C.FALSE_START_POINTS);
    });
    points.forEach((p, id) => (p > 0 ? this.game.award(id, p) : this.game.adjust(id, p)));

    const order = valid.concat(ids.filter(id => !valid.includes(id)));
    this.rows = order.map(id => {
      const r = this.reports.get(id);
      return {
        id,
        name: this.name(id),
        ms: r && !r.falseStart ? r.ms : null,
        falseStart: !!(r && r.falseStart),
        points: points.get(id) || 0
      };
    });
    if (valid.length) this.lines.push(`Raskest: ${this.name(valid[0])} (${this.reports.get(valid[0]).ms} ms).`);
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "react") return this.report(player, data);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") return this.step === "running" ? this.reveal() : this.finish();
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "running" || this.reports.has(bot.id)) return;
    if (this.game.now() >= this.outAt) this.report(bot, this.chance(0.05) ? { falseStart: true } : { ms: randInt(170, 450) });
  }

  timing() {
    return { lightsAt: this.lightsAt, lightMs: this.lightMs, lights: C.LIGHTS, outAt: this.outAt };
  }

  hostView() {
    return {
      type: "reaksjon",
      step: this.step,
      timing: this.timing(),
      reported: this.reports.size,
      totalPlayers: this.activeParticipants().length,
      rows: this.step === "reveal" ? this.rows.map(({ name, ms: t, falseStart, points }) => ({ name, ms: t, falseStart, points })) : null,
      autoAt: this.step === "running" ? null : this.autoAt,
      actions: [],
      menu: [{ action: "next", label: this.step === "running" ? "Avslør nå" : "Gå videre nå" }]
    };
  }

  playerView(player) {
    const mine = this.step === "reveal" ? this.rows.find(r => r.id === player.id) : null;
    const report = this.reports.get(player.id);
    return {
      type: "reaksjon",
      step: this.step,
      timing: this.timing(),
      reported: !!report,
      mine: mine ? { ms: mine.ms, falseStart: mine.falseStart, points: mine.points, place: this.rows.indexOf(mine) + 1 } : null
    };
  }
}

module.exports = ReactionRound;

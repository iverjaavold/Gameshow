/*
  Minirunde – Gjett 30 sekunder.
  Appen viser «Nå!». Ingen klokke vises. Hver spiller trykker når hen tror det har gått 30 sekunder.
  −50 poeng per sekund unna (rundet til nærmeste hele sekund). Avsløres når alle har trykket.
  Den som ikke har trykket etter 60 sekunder, regnes som 30 sekunder unna.
  Tiden måles på serveren når trykket kommer inn.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { ms, randFloat } = require("../util");

const C = config.TRETTI;

class ThirtyRound extends Round {
  start() {
    this.step = "running"; // running | reveal
    this.startedAt = Date.now();
    this.presses = new Map(); // spiller -> millisekunder etter start
    this.botTargets = new Map();
    this.auto(() => this.reveal(), C.MAX_SECONDS);
    this.changed();
  }

  press(player) {
    if (this.step !== "running") throw new GameError("For sent.");
    if (this.presses.has(player.id)) return;
    this.presses.set(player.id, Date.now() - this.startedAt);
    if (this.allIn(this.presses)) this.reveal();
    this.changed();
  }

  reveal() {
    if (this.step === "reveal") return;
    this.step = "reveal";
    this.rows = this.activeParticipants().map(id => {
      const t = this.presses.has(id) ? this.presses.get(id) / ms(1) : null;
      const off = t === null ? C.MISSING_OFF_SECONDS : Math.round(Math.abs(t - C.TARGET_SECONDS));
      const points = off * C.POINTS_PER_SECOND_OFF;
      if (points) this.game.adjust(id, points);
      return { id, name: this.name(id), seconds: t === null ? null : Math.round(t * 10) / 10, off, points };
    }).sort((a, b) => a.off - b.off);
    if (this.rows.length) this.lines.push(`Nærmest: ${this.rows[0].name} (${this.rows[0].seconds ?? "–"} s).`);
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action) {
    if (action === "press") return this.press(player);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") return this.step === "running" ? this.reveal() : this.finish();
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "running" || this.presses.has(bot.id)) return;
    if (!this.botTargets.has(bot.id)) this.botTargets.set(bot.id, randFloat(24, 37));
    if (Date.now() - this.startedAt >= ms(this.botTargets.get(bot.id))) this.press(bot);
  }

  hostView() {
    // Mens tiden går, vises ingenting som kan avsløre tiden (heller ikke hvem som har trykket).
    return {
      type: "tretti",
      step: this.step,
      autoAt: this.step === "running" ? null : this.autoAt, // ingen klokke mens tiden går
      rows: this.step === "reveal" ? this.rows.map(({ name, seconds, off, points }) => ({ name, seconds, off, points })) : null,
      actions: [],
      menu: [{ action: "next", label: this.step === "running" ? "Avslør nå" : "Gå videre nå" }]
    };
  }

  playerView(player) {
    const mine = this.step === "reveal" ? this.rows.find(r => r.id === player.id) : null;
    return {
      type: "tretti",
      step: this.step,
      pressed: this.presses.has(player.id),
      mine: mine ? { seconds: mine.seconds, off: mine.off, points: mine.points } : null
    };
  }
}

module.exports = ThirtyRound;

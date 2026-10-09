/*
  Minirunde – Gjett 30 sekunder.
  Hver spiller starter sin egen tid på mobilen når hen er klar («START»), og trykker «STOPP»
  når hen tror det har gått 30 sekunder. Ingen klokke vises.
  −50 poeng per sekund unna (rundet til nærmeste hele sekund). Avsløres når alle er ferdige.
  Den som ikke har stoppet 60 sekunder etter sin egen start, eller ikke har startet før tiden
  for hele runden er ute, regnes som 30 sekunder unna. Tiden måles på serveren.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { ms, randFloat } = require("../util");

const C = config.TRETTI;

class ThirtyRound extends Round {
  start() {
    this.step = "running"; // running | reveal
    this.startedAt = this.game.now();
    this.starts = new Map(); // spiller -> spilltid da hen trykket START
    this.presses = new Map(); // spiller -> millisekunder fra egen start (null = for sent)
    this.botStarts = new Map();
    this.botTargets = new Map();
    this.auto(() => this.reveal(), C.ROUND_SECONDS);
    this.changed();
  }

  begin(player) {
    if (this.step !== "running") throw new GameError("For sent.");
    if (this.starts.has(player.id)) return;
    this.starts.set(player.id, this.game.now());
    // Glemmer man å stoppe, er man ute etter MAX_SECONDS.
    this.timer(() => {
      if (this.presses.has(player.id)) return;
      this.presses.set(player.id, null);
      if (this.allIn(this.presses)) this.reveal();
    }, C.MAX_SECONDS);
    this.changed();
  }

  press(player) {
    if (this.step !== "running") throw new GameError("For sent.");
    if (!this.starts.has(player.id)) throw new GameError("Trykk START først.");
    if (this.presses.has(player.id)) return;
    this.presses.set(player.id, this.game.now() - this.starts.get(player.id));
    if (this.allIn(this.presses)) this.reveal();
    this.changed();
  }

  reveal() {
    if (this.step === "reveal") return;
    this.step = "reveal";
    this.rows = this.activeParticipants().map(id => {
      const t = this.presses.has(id) && this.presses.get(id) !== null ? this.presses.get(id) / ms(1) : null;
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
    if (action === "start") return this.begin(player);
    if (action === "press") return this.press(player);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") return this.step === "running" ? this.reveal() : this.finish();
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "running" || this.presses.has(bot.id)) return;
    if (!this.starts.has(bot.id)) {
      if (!this.botStarts.has(bot.id)) this.botStarts.set(bot.id, randFloat(1, 8));
      if (this.game.now() - this.startedAt >= ms(this.botStarts.get(bot.id))) this.begin(bot);
      return;
    }
    if (!this.botTargets.has(bot.id)) this.botTargets.set(bot.id, randFloat(24, 37));
    if (this.game.now() - this.starts.get(bot.id) >= ms(this.botTargets.get(bot.id))) this.press(bot);
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
      started: this.starts.has(player.id),
      pressed: this.presses.has(player.id),
      mine: mine ? { seconds: mine.seconds, off: mine.off, points: mine.points } : null
    };
  }
}

module.exports = ThirtyRound;

/*
  Minirunde – Gruva.
  En poengverdi stiger gradvis (+50 per sekund, raskere mot slutten).
  Trykk «Ta poengene» for å få verdien akkurat da. På et hemmelig, tilfeldig tidspunkt (10–40 s)
  raser gruva, og alle som fortsatt er inne får −500.
  Raset trekkes og holdes på serveren. Trykk registreres med tidsstempel på serveren;
  et trykk som kommer etter raset, teller som −500.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { ms, randFloat } = require("../util");

const C = config.GRUVA;

function valueAt(seconds) {
  if (seconds <= 0) return 0;
  return Math.floor(C.POINTS_PER_SECOND * seconds + C.ACCELERATION * seconds * seconds);
}

class MineRound extends Round {
  start() {
    this.step = "running"; // running | reveal
    this.startedAt = this.at(C.LEAD_IN_SECONDS);
    this.crashSeconds = randFloat(C.MIN_CRASH_SECONDS, C.MAX_CRASH_SECONDS);
    this.crashAt = this.startedAt + ms(this.crashSeconds); // HEMMELIG – sendes aldri før raset
    this.taken = new Map(); // spiller -> verdi
    this.botTargets = new Map();
    this.crashTimer = this.timer(() => this.crash(), (this.crashAt - Date.now()) / ms(1));
    this.changed();
  }

  secondsNow() {
    return (Date.now() - this.startedAt) / ms(1);
  }

  take(player) {
    if (this.taken.has(player.id)) return;
    if (Date.now() < this.startedAt) throw new GameError("Vent til gruva åpner!");
    if (this.step !== "running" || Date.now() >= this.crashAt) {
      this.taken.set(player.id, C.CRASH_POINTS);
      return this.changed();
    }
    const value = valueAt(this.secondsNow());
    this.taken.set(player.id, value);
    this.game.award(player.id, value);
    // Alle har tatt poengene: avslutt før raset
    if (this.allIn(this.taken)) this.crash();
    this.changed();
  }

  crash() {
    if (this.step !== "running") return;
    this.clearTimer(this.crashTimer);
    this.step = "reveal";
    this.crashed = Date.now() >= this.crashAt - 50;
    this.activeParticipants().forEach(id => {
      if (!this.taken.has(id)) {
        this.taken.set(id, C.CRASH_POINTS);
        this.game.adjust(id, C.CRASH_POINTS);
      }
    });
    const caught = [...this.taken.entries()].filter(([, v]) => v === C.CRASH_POINTS).map(([id]) => this.name(id));
    this.lines.push(caught.length ? `Tatt av raset: ${caught.join(", ")}.` : "Alle kom seg ut i tide!");
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action) {
    if (action === "take") return this.take(player);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") return this.step === "running" ? this.crash() : this.finish();
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "running" || this.taken.has(bot.id) || Date.now() < this.startedAt) return;
    if (!this.botTargets.has(bot.id)) this.botTargets.set(bot.id, randFloat(5, 35));
    if (this.secondsNow() >= this.botTargets.get(bot.id)) this.take(bot);
  }

  hostView() {
    return {
      type: "gruva",
      step: this.step,
      startedAt: this.startedAt,
      secMs: ms(1), // klienten regner ut verdien selv (formelen er ikke hemmelig – rastidspunktet er det)
      pps: C.POINTS_PER_SECOND,
      accel: C.ACCELERATION,
      // Hvem som har gått ut vises, men ikke tallet de tok
      players: this.activeParticipants().map(id => ({ ...this.publicPlayer(id), out: this.taken.has(id) && (this.step === "running" || this.taken.get(id) !== C.CRASH_POINTS) })),
      crashed: this.step === "reveal" ? !!this.crashed : null,
      crashSeconds: this.step === "reveal" ? Math.round(this.crashSeconds * 10) / 10 : null,
      caught: this.step === "reveal" ? [...this.taken.entries()].filter(([, v]) => v === C.CRASH_POINTS).map(([id]) => this.name(id)) : null,
      actions: [],
      menu: [{ action: "next", label: this.step === "running" ? "La gruva rase nå" : "Gå videre nå" }]
    };
  }

  playerView(player) {
    return {
      type: "gruva",
      step: this.step,
      startedAt: this.startedAt,
      secMs: ms(1),
      pps: C.POINTS_PER_SECOND,
      accel: C.ACCELERATION,
      taken: this.taken.has(player.id) ? this.taken.get(player.id) : null,
      crashPoints: C.CRASH_POINTS,
      crashed: this.step === "reveal"
    };
  }
}

module.exports = MineRound;

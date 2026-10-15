/*
  Minirunde – Balanser ballen (gyroskop).
  Alle får en ball på mobilen og styrer den ved å vippe telefonen. Målet er å holde ballen
  så nær senteret som mulig. Senteret flytter seg 3–4 ganger i løpet av ett minutt.
  Ballen regnes ut på mobilen, som sender posisjonen til serveren flere ganger i sekundet.
  Serveren gir poeng etter hvor nær senteret ballen har vært i gjennomsnitt.
  Koordinater: -1 til 1 i begge retninger.
*/

const config = require("../config");
const { Round } = require("./base");
const { randInt, ms } = require("../util");

const C = config.BALANSE;

class BalanceRound extends Round {
  start() {
    this.step = "ready"; // ready | play | done
    this.balls = new Map(); // spiller -> { x, y, score, samples, last }
    this.activeParticipants().forEach(id => this.balls.set(id, { x: 0, y: 0, score: 0, samples: 0, last: null }));
    this.auto(() => this.startPlay(), C.READY_SECONDS);
    this.changed();
  }

  startPlay() {
    if (this.step !== "ready") return;
    this.step = "play";
    this.startedAt = this.game.now();
    // Senteret: start i midten, flytt det 3–4 ganger til tilfeldige steder
    const moves = randInt(C.TARGET_MOVES_MIN, C.TARGET_MOVES_MAX);
    const span = ms(C.PLAY_SECONDS) / (moves + 1);
    this.targets = [{ at: this.startedAt, x: 0, y: 0 }];
    for (let i = 1; i <= moves; i++) {
      this.targets.push({
        at: Math.round(this.startedAt + span * i + (Math.random() - 0.5) * span * 0.4),
        x: (Math.random() * 2 - 1) * C.TARGET_RANGE,
        y: (Math.random() * 2 - 1) * C.TARGET_RANGE
      });
    }
    this.auto(() => this.end(), C.PLAY_SECONDS);
    this.tick();
    this.changed();
  }

  // Sender oppdatert stilling til skjermene noen ganger i sekundet
  tick() {
    if (this.step !== "play") return;
    this.changed();
    this.timer(() => this.tick(), C.BROADCAST_SECONDS);
  }

  targetAt(t) {
    let target = this.targets[0];
    this.targets.forEach(tg => {
      if (tg.at <= t) target = tg;
    });
    return target;
  }

  report(player, data) {
    if (this.step !== "play") return;
    const ball = this.balls.get(player.id);
    if (!ball) return;
    const x = Math.max(-1, Math.min(1, Number(data.x) || 0));
    const y = Math.max(-1, Math.min(1, Number(data.y) || 0));
    const now = this.game.now();
    // Poeng for tiden siden forrige rapport, etter avstanden til senteret
    const dt = ball.last === null ? 0 : Math.min(1000, now - ball.last);
    const target = this.targetAt(now);
    const dist = Math.hypot(x - target.x, y - target.y);
    ball.score += Math.max(0, 1 - dist / C.SCORE_RADIUS) * dt;
    ball.x = x;
    ball.y = y;
    ball.last = now;
  }

  end() {
    if (this.step === "done") return;
    this.step = "done";
    const total = ms(C.PLAY_SECONDS);
    this.results = [...this.balls.entries()]
      .filter(([id]) => this.player(id))
      .map(([id, b]) => ({ id, share: Math.min(1, b.score / total) }))
      .sort((a, b) => b.share - a.share);
    this.results.forEach(r => {
      r.points = Math.round(r.share * C.MAX_POINTS / 10) * 10;
      if (r.points) this.game.award(r.id, r.points);
    });
    if (this.results.length) this.lines.push(`Best balanse: ${this.name(this.results[0].id)} (${Math.round(this.results[0].share * 100)} %).`);
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "ball") return this.report(player, data);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") {
      if (this.step === "ready") return this.startPlay();
      if (this.step === "play") return this.end();
      return this.finish();
    }
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "play") return;
    const t = this.targetAt(this.game.now());
    const b = this.balls.get(bot.id);
    if (!b) return;
    // Bots glir mot senteret med litt slingring
    this.report(bot, {
      x: b.x + (t.x - b.x) * 0.3 + (Math.random() - 0.5) * 0.3,
      y: b.y + (t.y - b.y) * 0.3 + (Math.random() - 0.5) * 0.3
    });
  }

  hostView() {
    const menu = [{ action: "next", label: { ready: "Start nå", play: "Avslutt nå" }[this.step] || "Gå videre nå" }];
    const t = this.step === "play" ? this.targetAt(this.game.now()) : { x: 0, y: 0 };
    return {
      type: "balanse",
      step: this.step,
      endsAt: this.autoAt,
      target: { x: t.x, y: t.y },
      targetRadius: C.SCORE_RADIUS,
      balls: [...this.balls.entries()].filter(([id]) => this.player(id)).map(([id, b]) => ({
        ...this.publicPlayer(id), x: b.x, y: b.y
      })),
      results: this.results ? this.results.map(r => ({ name: this.name(r.id), share: r.share, points: r.points })) : null,
      actions: [],
      menu
    };
  }

  playerView(player) {
    const mine = this.results && this.results.find(r => r.id === player.id);
    return {
      type: "balanse",
      step: this.step,
      endsAt: this.autoAt,
      // Hele planen for senteret, så mobilen kan flytte det i riktig øyeblikk selv
      targets: this.step === "play" ? this.targets : null,
      targetRadius: C.SCORE_RADIUS,
      result: mine ? { share: mine.share, points: mine.points, place: this.results.indexOf(mine) + 1 } : null
    };
  }
}

module.exports = BalanceRound;

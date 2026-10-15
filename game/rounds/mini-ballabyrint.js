/*
  Minirunde – Ball gjennom labyrint (samarbeid, to og to, gyroskop).
  Hvert lag har en ball i en labyrint på hovedskjermen. Den ene vipper mobilen til venstre/høyre,
  den andre forover/bakover. Ingen kommer gjennom alene.
  Jo nærmere ballen er en vegg, jo mer bremser den – man kjenner faren før man krasjer.
  Fysikken kjøres på serveren, mobilene sender bare hvor mye de vipper (-1 til 1).
  Alle lag får samme labyrint. Først i mål får mest, ellers poeng etter hvor langt man kom.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const maze = require("../maze");

const C = config.BALLABYRINT;
const R = 0.28; // ballens radius i flis-enheter

class BallMazeRound extends Round {
  start() {
    const ids = this.activeParticipants();
    const fixed = (this.options.fixedTeams || [])
      .map(t => t.filter(id => ids.includes(id)))
      .filter(t => t.length === 2);
    const groups = this.game.randomizer.pairs(ids, fixed);
    this.maze = maze.generate(C.WIDTH, C.HEIGHT);
    this.grid = maze.toTiles(this.maze);
    this.goal = { x: this.grid.W - 2 + 0.5, y: this.grid.H - 2 + 0.5 };
    // Første styrer venstre/høyre, andre opp/ned. Er man alene, styrer man begge. En tredje hjelper til med opp/ned.
    this.teams = groups.map((g, i) => ({
      id: i, ids: g, xCtl: g[0], yCtl: g.length > 1 ? g[1] : g[0],
      x: 1.5, y: 1.5, vx: 0, vy: 0, tx: 0, ty: 0, place: null, best: 0
    }));
    this.finished = 0;
    this.step = "ready"; // ready | play | done
    this.auto(() => this.startPlay(), C.READY_SECONDS);
    this.changed();
  }

  startPlay() {
    if (this.step !== "ready") return;
    this.step = "play";
    this.auto(() => this.end(), C.PLAY_SECONDS);
    this.ticks = 0;
    this.tick();
    this.changed();
  }

  wall(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.grid.W || ty >= this.grid.H) return true;
    return this.grid.tiles[ty * this.grid.W + tx] === 1;
  }

  // Avstand fra ballens kant til nærmeste vegg (for bremsingen)
  wallGap(x, y) {
    let best = 2;
    for (let ty = Math.floor(y) - 1; ty <= Math.floor(y) + 1; ty++) {
      for (let tx = Math.floor(x) - 1; tx <= Math.floor(x) + 1; tx++) {
        if (!this.wall(tx, ty)) continue;
        const dx = Math.max(tx - x, 0, x - (tx + 1));
        const dy = Math.max(ty - y, 0, y - (ty + 1));
        best = Math.min(best, Math.hypot(dx, dy) - R);
      }
    }
    return Math.max(0, best);
  }

  collides(x, y) {
    for (let ty = Math.floor(y - R); ty <= Math.floor(y + R); ty++) {
      for (let tx = Math.floor(x - R); tx <= Math.floor(x + R); tx++) {
        if (!this.wall(tx, ty)) continue;
        const dx = Math.max(tx - x, 0, x - (tx + 1));
        const dy = Math.max(ty - y, 0, y - (ty + 1));
        if (Math.hypot(dx, dy) < R) return true;
      }
    }
    return false;
  }

  tick() {
    if (this.step !== "play") return;
    const dt = C.TICK_SECONDS;
    this.teams.forEach(t => {
      if (t.place) return;
      t.vx = (t.vx + t.tx * C.ACCEL * dt) * C.FRICTION;
      t.vy = (t.vy + t.ty * C.ACCEL * dt) * C.FRICTION;
      // Brems nær vegger: farten skaleres ned jo nærmere en vegg ballen er
      const brake = Math.max(C.MIN_BRAKE, Math.min(1, this.wallGap(t.x, t.y) / C.BRAKE_DISTANCE));
      const max = C.MAX_SPEED * brake;
      const speed = Math.hypot(t.vx, t.vy);
      if (speed > max) {
        t.vx *= max / speed;
        t.vy *= max / speed;
      }
      // Flytt én akse om gangen, så ballen glir langs veggene
      const nx = t.x + t.vx * dt;
      if (this.collides(nx, t.y)) t.vx = 0;
      else t.x = nx;
      const ny = t.y + t.vy * dt;
      if (this.collides(t.x, ny)) t.vy = 0;
      else t.y = ny;
      t.best = Math.max(t.best, this.progressOf(t));
      if (Math.hypot(t.x - this.goal.x, t.y - this.goal.y) < 0.5) {
        t.place = ++this.finished;
        if (this.teams.every(team => team.place)) this.soon(() => this.end());
      }
    });
    this.ticks++;
    if (this.ticks % C.BROADCAST_EVERY === 0) this.changed();
    this.timer(() => this.tick(), dt);
  }

  progressOf(t) {
    const cx = Math.min(this.maze.w - 1, Math.max(0, Math.floor((t.x - 1) / 2)));
    const cy = Math.min(this.maze.h - 1, Math.max(0, Math.floor((t.y - 1) / 2)));
    return maze.progress(this.maze, cx, cy);
  }

  teamOf(id) {
    return this.teams.find(t => t.ids.includes(id));
  }

  tilt(player, data) {
    if (this.step !== "play") return;
    const team = this.teamOf(player.id);
    if (!team) throw new GameError("Du er ikke med på et lag.");
    const v = Math.max(-1, Math.min(1, Number(data.v) || 0));
    const axis = data.axis === "y" ? "y" : "x";
    if (axis === "x" && team.xCtl === player.id) team.tx = v;
    if (axis === "y" && (team.yCtl === player.id || (team.ids.length > 2 && team.ids[2] === player.id))) team.ty = v;
  }

  end() {
    if (this.step === "done") return;
    this.step = "done";
    this.teams.forEach(t => {
      t.points = t.place
        ? C.FINISH_POINTS[Math.min(t.place - 1, C.FINISH_POINTS.length - 1)]
        : Math.round(t.best * C.PROGRESS_POINTS / 10) * 10;
      t.ids.forEach(id => this.game.award(id, t.points));
    });
    const winner = this.teams.filter(t => t.place).sort((a, b) => a.place - b.place)[0];
    this.lines.push(winner ? `Først i mål: ${this.names(winner.ids).join(" og ")}.` : "Ingen kom i mål.");
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "tilt") return this.tilt(player, data);
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
    const t = this.teamOf(bot.id);
    if (!t || t.place) return;
    // Bots vipper mot neste rute på riktig vei
    const cx = Math.floor((t.x - 1) / 2), cy = Math.floor((t.y - 1) / 2);
    const here = this.maze.dist[cy * this.maze.w + cx];
    let target = { x: this.goal.x, y: this.goal.y };
    Object.keys(maze.DIRS).forEach(dir => {
      if (!maze.canMove(this.maze, cx, cy, dir)) return;
      const d = maze.DIRS[dir];
      if (this.maze.dist[(cy + d.dy) * this.maze.w + cx + d.dx] < here) target = { x: 2 * (cx + d.dx) + 1.5, y: 2 * (cy + d.dy) + 1.5 };
    });
    if (t.xCtl === bot.id) this.tilt(bot, { axis: "x", v: Math.max(-1, Math.min(1, (target.x - t.x) * 1.5)) });
    if (t.yCtl === bot.id) this.tilt(bot, { axis: "y", v: Math.max(-1, Math.min(1, (target.y - t.y) * 1.5)) });
  }

  hostView() {
    const menu = [{ action: "next", label: { ready: "Start nå", play: "Avslutt nå" }[this.step] || "Gå videre nå" }];
    return {
      type: "ballabyrint",
      step: this.step,
      endsAt: this.autoAt,
      grid: this.grid,
      goal: this.goal,
      teams: this.teams.map(t => ({
        names: this.names(t.ids),
        x: t.x, y: t.y, place: t.place,
        progress: t.place ? 1 : t.best,
        points: this.step === "done" ? t.points : null
      })),
      actions: [],
      menu
    };
  }

  playerView(player) {
    const t = this.teamOf(player.id);
    if (!t) return { type: "ballabyrint", step: this.step, axis: null };
    const axes = [];
    if (t.xCtl === player.id) axes.push("x");
    if (t.yCtl === player.id || (t.ids.length > 2 && t.ids[2] === player.id)) axes.push("y");
    return {
      type: "ballabyrint",
      step: this.step,
      endsAt: this.autoAt,
      axes,
      partner: this.names(t.ids.filter(id => id !== player.id)).join(" og "),
      teamNo: t.id + 1,
      place: t.place,
      points: this.step === "done" ? t.points : null
    };
  }
}

module.exports = BallMazeRound;

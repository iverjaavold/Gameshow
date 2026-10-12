/*
  Minirunde – Labyrint (samarbeid, to og to).
  Hvert lag har en navigatør som ser labyrinten på mobilen, og en styrer som bare har
  piltaster og ikke ser noe. De må snakke seg gjennom labyrinten sammen.
  Hovedskjermen viser en fremdriftsstolpe for hvert lag. Alle lag får samme labyrint.
  Først i mål får mest. Lag som ikke rekker det, får poeng etter hvor langt de kom.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const maze = require("../maze");

const C = config.LABYRINT;

class MazeRound extends Round {
  start() {
    const ids = this.activeParticipants();
    const fixed = (this.options.fixedTeams || [])
      .map(t => t.filter(id => ids.includes(id)))
      .filter(t => t.length === 2);
    const groups = this.game.randomizer.pairs(ids, fixed);
    this.maze = maze.generate(C.WIDTH, C.HEIGHT);
    // Første i gruppen ser labyrinten, andre styrer. En tredje er også navigatør.
    this.teams = groups.map((ids, i) => ({
      id: i, ids, driver: ids.length > 1 ? ids[1] : ids[0],
      x: 0, y: 0, bumps: 0, moves: 0, finishedAt: null, place: null, bumpAt: 0, trail: [[0, 0]]
    }));
    this.finished = 0;
    this.step = "ready"; // ready | play | done
    this.auto(() => this.startPlay(), C.READY_SECONDS);
    this.changed();
  }

  startPlay() {
    if (this.step !== "ready") return;
    this.step = "play";
    this.startedAt = this.game.now();
    this.auto(() => this.end(), C.PLAY_SECONDS);
    this.changed();
  }

  teamOf(id) {
    return this.teams.find(t => t.ids.includes(id));
  }

  move(player, dir) {
    if (this.step !== "play") throw new GameError("Vent til labyrinten åpner.");
    const team = this.teamOf(player.id);
    if (!team || team.driver !== player.id) throw new GameError("Det er styreren som flytter.");
    if (team.finishedAt) return;
    if (!maze.DIRS[dir]) throw new GameError("Ugyldig retning.");
    if (!maze.canMove(this.maze, team.x, team.y, dir)) {
      team.bumps++;
      team.bumpAt = this.game.now();
      this.changed();
      return;
    }
    const d = maze.DIRS[dir];
    team.x += d.dx;
    team.y += d.dy;
    team.moves++;
    team.trail.push([team.x, team.y]);
    if (team.trail.length > 200) team.trail.shift();
    if (team.x === this.maze.goal.x && team.y === this.maze.goal.y) {
      team.finishedAt = this.game.now();
      team.place = ++this.finished;
      if (this.teams.every(t => t.finishedAt)) this.soon(() => this.end());
    }
    this.changed();
  }

  end() {
    if (this.step === "done") return;
    this.step = "done";
    this.teams.forEach(team => {
      const points = team.place
        ? C.FINISH_POINTS[Math.min(team.place - 1, C.FINISH_POINTS.length - 1)]
        : Math.round(maze.progress(this.maze, team.x, team.y) * C.PROGRESS_POINTS / 10) * 10;
      team.points = points;
      team.ids.forEach(id => this.game.award(id, points));
    });
    const winner = this.teams.filter(t => t.place).sort((a, b) => a.place - b.place)[0];
    this.lines.push(winner ? `Først i mål: ${this.names(winner.ids).join(" og ")}.` : "Ingen kom i mål.");
    this.auto(() => this.finish(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "move") return this.move(player, data.dir);
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
    const team = this.teamOf(bot.id);
    if (!team || team.driver !== bot.id || team.finishedAt || !this.chance(0.5)) return;
    // Bots følger riktig vei, men bommer av og til
    const here = this.maze.dist[team.y * this.maze.w + team.x];
    const good = Object.keys(maze.DIRS).find(dir => {
      if (!maze.canMove(this.maze, team.x, team.y, dir)) return false;
      const d = maze.DIRS[dir];
      return this.maze.dist[(team.y + d.dy) * this.maze.w + team.x + d.dx] < here;
    });
    const dirs = Object.keys(maze.DIRS);
    this.move(bot, this.chance(0.75) && good ? good : dirs[Math.floor(Math.random() * dirs.length)]);
  }

  mazeView() {
    return { w: this.maze.w, h: this.maze.h, walls: this.maze.walls, goal: this.maze.goal };
  }

  hostView() {
    const menu = [{ action: "next", label: { ready: "Start nå", play: "Avslutt nå" }[this.step] || "Gå videre nå" }];
    return {
      type: "labyrint",
      step: this.step,
      endsAt: this.autoAt,
      teams: this.teams.map(t => ({
        names: this.names(t.ids),
        figures: t.ids.map(id => this.publicPlayer(id)),
        progress: maze.progress(this.maze, t.x, t.y),
        bumps: t.bumps,
        place: t.place,
        points: this.step === "done" ? t.points : null
      })),
      maze: this.step === "done" ? this.mazeView() : null,
      actions: [],
      menu
    };
  }

  playerView(player) {
    const team = this.teamOf(player.id);
    if (!team) return { type: "labyrint", step: this.step, role: null };
    const role = team.driver === player.id ? "driver" : "navigator";
    const partner = this.names(team.ids.filter(id => id !== player.id)).join(" og ");
    return {
      type: "labyrint",
      step: this.step,
      endsAt: this.autoAt,
      role,
      partner,
      maze: role === "navigator" || this.step === "done" ? this.mazeView() : null,
      pos: { x: team.x, y: team.y },
      trail: role === "navigator" ? team.trail : null,
      bumpAt: team.bumpAt,
      bumps: team.bumps,
      progress: maze.progress(this.maze, team.x, team.y),
      place: team.place,
      points: this.step === "done" ? team.points : null
    };
  }
}

module.exports = MazeRound;

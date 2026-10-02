/*
  Runde 3 – Tegn etter beskrivelse.
  Alle par spiller samtidig. Forklareren ser fasiten, byggeren(e) bygger i et felles rutenett på serveren.
  Rollene går på rundgang for hver figur. Form, farge og rotasjon må stemme i hver rute.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { shuffle, pick, randInt } = require("../util");

const C = config.R3;
const SHAPES = ["firkant", "sirkel", "trekant", "pil", "halvsirkel"];
const SYMMETRIC = new Set(["firkant", "sirkel"]); // rotasjon synes ikke
const ASYMMETRIC = SHAPES.filter(s => !SYMMETRIC.has(s));
const COLORS = ["rød", "blå", "grønn", "gul"];

function makeFigure(level) {
  const count = C.SHAPES_LEVEL_1 + level - 1;
  const cells = shuffle([...Array(C.GRID * C.GRID).keys()]).slice(0, count);
  const grid = Array(C.GRID * C.GRID).fill(null);
  cells.forEach((cell, i) => {
    // Høyere nivå: flere former der rotasjonen betyr noe.
    const s = level >= 3 || i % 2 === 0 ? pick(ASYMMETRIC) : pick(SHAPES);
    grid[cell] = { s, c: pick(COLORS), r: SYMMETRIC.has(s) ? 0 : randInt(0, 3) };
  });
  return grid;
}

function sameCell(a, b) {
  if (!a || !b) return !a && !b;
  if (a.s !== b.s || a.c !== b.c) return false;
  return SYMMETRIC.has(a.s) || a.r === b.r;
}

function validCell(cell) {
  if (cell === null) return true;
  return cell && SHAPES.includes(cell.s) && COLORS.includes(cell.c) && [0, 1, 2, 3].includes(cell.r);
}

class DrawRound extends Round {
  start() {
    const choice = this.options.leaderChoice;
    const fixed = Array.isArray(choice) && choice.every(id => this.participants.includes(id)) ? [choice] : [];
    const groups = this.game.randomizer.pairs(this.participants, fixed);
    this.teams = groups.map((members, i) => ({ id: i, members, figIndex: -1, solved: 0, status: "playing", feedback: null }));
    this.teams.forEach(team => this.nextFigure(team));
    this.changed();
  }

  teamOf(playerId) {
    return this.teams.find(t => t.members.includes(playerId));
  }

  explainerOf(team) {
    return team.members[team.figIndex % team.members.length];
  }

  nextFigure(team) {
    this.clearTimer(team.timer);
    team.figIndex++;
    if (team.figIndex >= C.FIGURES || team.members.length < 2) {
      team.status = "done";
      team.target = null;
      if (this.teams.every(t => t.status === "done")) this.allDone = true;
      return;
    }
    team.level = team.figIndex + 1;
    team.target = makeFigure(team.level);
    team.grid = Array(C.GRID * C.GRID).fill(null);
    team.endsAt = Date.now() + C.SECONDS_PER_FIGURE * 1000;
    team.timer = this.timer(() => {
      team.feedback = { kind: "timeout", at: Date.now() };
      this.nextFigure(team);
    }, C.SECONDS_PER_FIGURE * 1000);
  }

  submit(team) {
    const correct = team.target.every((cell, i) => sameCell(cell, team.grid[i]));
    if (correct) {
      const points = team.level * C.POINTS_PER_LEVEL;
      team.members.forEach(id => this.game.award(id, points));
      team.solved++;
      team.feedback = { kind: "correct", at: Date.now() };
      this.nextFigure(team);
    } else {
      const wrong = team.target.filter((cell, i) => !sameCell(cell, team.grid[i])).length;
      team.feedback = { kind: "wrong", at: Date.now(), wrong };
    }
    this.changed();
  }

  hostAction(action) {
    if (action === "finish") return this.finish();
    return super.hostAction(action);
  }

  playerAction(player, action, data) {
    const team = this.teamOf(player.id);
    if (!team || team.status !== "playing") throw new GameError("Laget ditt er ferdig.");
    if (this.explainerOf(team) === player.id) throw new GameError("Forklareren kan ikke bygge.");
    if (action === "cell") {
      const index = Number(data.index);
      if (!Number.isInteger(index) || index < 0 || index >= C.GRID * C.GRID) throw new GameError("Ugyldig rute.");
      const cell = data.cell ? { s: data.cell.s, c: data.cell.c, r: Number(data.cell.r) } : null;
      if (!validCell(cell)) throw new GameError("Ugyldig form.");
      team.grid[index] = cell;
      return this.changed();
    }
    if (action === "clear") {
      team.grid = Array(C.GRID * C.GRID).fill(null);
      return this.changed();
    }
    if (action === "submit") return this.submit(team);
    return super.playerAction(player, action);
  }

  summary() {
    return this.teams.map(t => `${this.names(t.members).join(" og ")} klarte ${t.solved} av ${C.FIGURES} figurer.`);
  }

  hostView() {
    return {
      type: "draw",
      grid: C.GRID,
      figures: C.FIGURES,
      allDone: !!this.allDone,
      teams: this.teams.map(t => ({
        names: this.names(t.members),
        explainer: t.status === "playing" ? this.name(this.explainerOf(t)) : null,
        level: t.level,
        solved: t.solved,
        status: t.status,
        endsAt: t.status === "playing" ? t.endsAt : null,
        grid: t.status === "playing" ? t.grid : null, // bare byggerens rutenett, aldri fasiten
        feedback: t.feedback
      })),
      actions: [{ action: "finish", label: this.allDone ? "Avslutt runden" : "Avslutt runden nå" }]
    };
  }

  playerView(player) {
    const team = this.teamOf(player.id);
    if (!team) return { type: "draw", done: true };
    const base = {
      type: "draw",
      grid: C.GRID,
      shapes: SHAPES,
      colors: COLORS,
      level: team.level,
      figures: C.FIGURES,
      solved: team.solved,
      feedback: team.feedback,
      done: team.status === "done"
    };
    if (team.status === "done") return base;
    const explainer = this.explainerOf(team);
    const isExplainer = explainer === player.id;
    return {
      ...base,
      role: isExplainer ? "explainer" : "builder",
      partnerNames: this.names(team.members.filter(id => id !== player.id)),
      explainerName: this.name(explainer),
      endsAt: team.endsAt,
      target: isExplainer ? team.target : null,
      board: isExplainer ? null : team.grid
    };
  }
}

module.exports = DrawRound;

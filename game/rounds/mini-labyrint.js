/*
  Minirunde – Labyrint (samarbeid, to og to, gyroskop).
  Hvert lag har en navigatør som ser labyrinten og ballen på mobilen, og en styrer som ikke ser
  noe, men vipper mobilen for å rulle ballen – samme vipping og kalibrering som i «Balanser ballen».
  De må snakke seg gjennom labyrinten sammen.
  Hovedskjermen viser bare en fremdriftsstolpe for hvert lag (labyrinten vises først til slutt).
  Bruker fysikken fra «Ball gjennom labyrint» (mini-ballabyrint.js), med bremsing nær veggene.
  Alle lag får samme labyrint. Først i mål får mest, ellers poeng etter hvor langt man kom.
*/

const config = require("../config");
const BallMazeRound = require("./mini-ballabyrint");

class MazeRound extends BallMazeRound {
  get C() {
    return config.LABYRINT;
  }

  // Styreren (andre på laget) vipper i begge retninger. Er man alene, styrer man selv.
  driverOf(team) {
    return team.ids.length > 1 ? team.ids[1] : team.ids[0];
  }

  controls(team, id) {
    return this.driverOf(team) === id;
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
        progress: t.place ? 1 : t.best,
        bumps: t.bumps,
        place: t.place,
        points: this.step === "done" ? t.points : null
      })),
      // Labyrinten vises først når runden er ferdig
      grid: this.step === "done" ? this.grid : null,
      goal: this.goal,
      actions: [],
      menu
    };
  }

  playerView(player) {
    const t = this.teamOf(player.id);
    if (!t) return { type: "labyrint", step: this.step, role: null };
    const role = this.driverOf(t) === player.id ? "driver" : "navigator";
    return {
      type: "labyrint",
      step: this.step,
      endsAt: this.autoAt,
      role,
      axes: role === "driver" ? ["x", "y"] : [],
      partner: this.names(t.ids.filter(id => id !== player.id)).join(" og "),
      // Bare navigatøren ser labyrinten og ballen
      grid: role === "navigator" || this.step === "done" ? this.grid : null,
      goal: this.goal,
      ball: role === "navigator" ? { x: +t.x.toFixed(2), y: +t.y.toFixed(2) } : null,
      bumpAt: t.bumpAt,
      bumps: t.bumps,
      progress: t.place ? 1 : t.best,
      place: t.place,
      points: this.step === "done" ? t.points : null
    };
  }
}

module.exports = MazeRound;

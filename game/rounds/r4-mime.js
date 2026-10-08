/*
  Runde 4 – Forklar-mime.
  To lag bytter på. Hver tur: én forklarer (ser ordet) og én mimer. Resten av laget gjetter.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { WORDS } = require("../content");
const { pick } = require("../util");

const C = config.R4;

class MimeRound extends Round {
  start() {
    this.teams = this.game.randomizer.twoTeams(this.participants);
    this.teamWords = [0, 0];
    this.turnsTaken = [0, 0];
    this.turnIndex = 0; // totalt antall turer startet
    this.step = "ready"; // ready | playing | turnOver | done
    this.lastTurn = null;
    this.setupTurn();
  }

  setupTurn() {
    const teamIndex = this.turnIndex % 2;
    const team = this.teams[teamIndex];
    const n = this.turnsTaken[teamIndex];
    this.current = {
      team: teamIndex,
      explainer: team[n % team.length],
      mimer: team[(n + 1) % team.length],
      words: 0,
      skipped: 0
    };
    this.step = "ready";
    this.word = null;
    // Trykker ikke forklareren «Start», starter turen av seg selv.
    this.auto(() => this.startTurn(), C.READY_SECONDS);
    this.changed();
  }

  drawWord() {
    const category = this.options.leaderChoice;
    const all = Object.entries(WORDS).flatMap(([c, list]) => list.map(w => ({ c, w })));
    let pool = all.filter(x => !this.game.usedWords.has(x.w) && (!category || x.c === category));
    if (!pool.length) pool = all.filter(x => !this.game.usedWords.has(x.w));
    if (!pool.length) {
      this.game.usedWords.clear();
      pool = all;
    }
    const chosen = pick(pool);
    this.game.usedWords.add(chosen.w);
    this.word = chosen.w;
  }

  startTurn() {
    if (this.step !== "ready") throw new GameError("Turen er allerede i gang.");
    this.cancelAuto();
    this.step = "playing";
    this.endsAt = this.at(C.TURN_SECONDS);
    this.drawWord();
    this.turnTimer = this.timer(() => this.endTurn(), C.TURN_SECONDS);
    this.changed();
  }

  correct() {
    if (this.step !== "playing") return;
    this.current.words++;
    this.teamWords[this.current.team]++;
    this.teams[this.current.team].forEach(id => this.game.award(id, C.POINTS_PER_WORD));
    this.drawWord();
    this.changed();
  }

  skip() {
    if (this.step !== "playing") return;
    this.current.skipped++;
    this.drawWord();
    this.changed();
  }

  endTurn() {
    if (this.step !== "playing") return;
    this.clearTimer(this.turnTimer);
    this.turnsTaken[this.current.team]++;
    this.turnIndex++;
    this.lastTurn = { team: this.current.team, words: this.current.words };
    this.word = null;
    this.step = this.turnIndex >= C.TURNS_PER_TEAM * 2 ? "done" : "turnOver";
    if (this.step === "done") {
      const [a, b] = this.teamWords;
      this.lines = [a === b ? `Uavgjort: ${a} ord hver!` : `Lag ${a > b ? 1 : 2} vant med ${Math.max(a, b)} mot ${Math.min(a, b)} ord!`];
      this.auto(() => this.finish(), C.BETWEEN_TURNS_SECONDS);
    } else {
      this.auto(() => this.setupTurn(), C.BETWEEN_TURNS_SECONDS);
    }
    this.changed();
  }

  // Testmodus: bot-forklareren starter og trykker «Riktig» innimellom.
  botAct(bot) {
    if (bot.id !== this.current.explainer) return;
    if (this.step === "ready" && this.chance(0.3)) return this.startTurn();
    if (this.step === "playing" && this.chance(0.1)) return this.chance(0.7) ? this.correct() : this.skip();
  }

  hostAction(action) {
    if (action === "startTurn") return this.startTurn();
    if (action === "correct") return this.correct();
    if (action === "skip") return this.skip();
    if (action === "endTurn") return this.endTurn();
    if (action === "next") {
      this.cancelAuto();
      if (this.step === "turnOver") return this.setupTurn();
      if (this.step === "done") return this.finish();
      return;
    }
    return super.hostAction(action);
  }

  playerAction(player, action) {
    if (player.id !== this.current.explainer) throw new GameError("Bare forklareren kan trykke her.");
    if (action === "startTurn") return this.startTurn();
    if (action === "correct") return this.correct();
    if (action === "skip") return this.skip();
    return super.playerAction(player, action);
  }

  hostView() {
    // Hosten har bare grønn/rød når et ord må vurderes. Resten skjer av seg selv.
    const actions = [];
    const menu = [];
    if (this.step === "playing") {
      actions.push({ action: "correct", label: "Riktig", style: "good" });
      actions.push({ action: "skip", label: "Hopp over", style: "bad" });
      menu.push({ action: "endTurn", label: "Stopp turen" });
    }
    if (this.step === "ready") menu.push({ action: "startTurn", label: "Start turen nå" });
    if (this.step === "turnOver" || this.step === "done") menu.push({ action: "next", label: "Gå videre nå" });
    return {
      menu,
      type: "mime",
      step: this.step,
      teams: this.teams.map(t => t.map(id => this.publicPlayer(id))),
      teamWords: this.teamWords,
      turn: Math.min(this.turnIndex + 1, C.TURNS_PER_TEAM * 2),
      turns: C.TURNS_PER_TEAM * 2,
      currentTeam: this.current.team,
      explainerName: this.name(this.current.explainer),
      mimerName: this.name(this.current.mimer),
      wordsThisTurn: this.current.words,
      endsAt: this.step === "playing" ? this.endsAt : null,
      lastTurn: this.lastTurn,
      actions
    };
  }

  playerView(player) {
    const myTeam = this.teams[0].includes(player.id) ? 0 : 1;
    let role = "audience";
    if (myTeam === this.current.team) {
      if (player.id === this.current.explainer) role = "explainer";
      else if (player.id === this.current.mimer) role = "mimer";
      else role = "guesser";
    }
    return {
      type: "mime",
      step: this.step,
      myTeam,
      currentTeam: this.current.team,
      role,
      explainerName: this.name(this.current.explainer),
      mimerName: this.name(this.current.mimer),
      word: role === "explainer" && this.step === "playing" ? this.word : null,
      wordsThisTurn: this.current.words,
      endsAt: this.step === "playing" ? this.endsAt : null
    };
  }
}

module.exports = MimeRound;

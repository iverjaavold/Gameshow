/*
  Runde 7 – Allianse eller svik.
  Lagene spiller etter hverandre med en fysisk kortstokk: høyere/lavere, registrert på mobilen.
  Riktig: +100 i potten. Feil: potten halveres. «Stopp» sikrer potten.
  Til slutt velger alle «Del» eller «Ta alt selv» i hemmelighet, og alt avsløres samtidig.
*/

const config = require("../config");
const { Round, GameError } = require("./base");

const C = config.R7;

class AllianceRound extends Round {
  start() {
    const fixed = (this.options.fixedTeams || [])
      .map(t => t.filter(id => this.participants.includes(id)))
      .filter(t => t.length >= 2);
    const groups = this.game.randomizer.smallTeams(this.participants, fixed);
    this.teams = groups.map(members => ({
      members,
      pot: 0,
      guesses: 0,
      guesser: 0,
      sub: "guess", // guess | result
      lastGuess: null,
      history: [],
      status: "waiting" // waiting | playing | stopped
    }));
    this.step = "play"; // play | choice | reveal
    this.teamIndex = 0;
    this.teams[0].status = "playing";
    this.choices = new Map();
    this.changed();
  }

  get team() {
    return this.teams[this.teamIndex];
  }

  teamOf(id) {
    return this.teams.find(t => t.members.includes(id));
  }

  guess(dir) {
    const team = this.team;
    if (this.step !== "play" || team.sub !== "guess") throw new GameError("Vent litt.");
    if (dir !== "higher" && dir !== "lower") throw new GameError("Ugyldig valg.");
    team.lastGuess = dir;
    team.sub = "result";
    this.changed();
  }

  result(ok) {
    const team = this.team;
    if (this.step !== "play" || team.sub !== "result") throw new GameError("Gjett først.");
    team.guesses++;
    if (ok) team.pot += C.POT_PER_CORRECT;
    else team.pot = Math.floor(team.pot / 2);
    team.history.push({ guess: team.lastGuess, ok: !!ok });
    team.guesser = (team.guesser + 1) % team.members.length;
    team.sub = "guess";
    team.lastGuess = null;
    if (team.guesses >= C.MAX_GUESSES) return this.stop();
    this.changed();
  }

  stop() {
    const team = this.team;
    if (this.step !== "play") return;
    if (team.sub === "result") throw new GameError("Registrer riktig/feil først.");
    team.status = "stopped";
    this.teamIndex++;
    if (this.teamIndex < this.teams.length) {
      this.team.status = "playing";
    } else {
      this.startChoice();
    }
    this.changed();
  }

  startChoice() {
    this.step = "choice";
    this.endsAt = Date.now() + C.CHOICE_SECONDS * 1000;
    this.choiceTimer = this.timer(() => this.reveal(), C.CHOICE_SECONDS * 1000);
  }

  reveal() {
    if (this.step !== "choice") return;
    this.clearTimer(this.choiceTimer);
    this.step = "reveal";
    this.outcomes = this.teams.map(team => {
      const picks = team.members.map(id => ({ id, name: this.name(id), take: this.choices.get(id) === "take" }));
      const takers = picks.filter(p => p.take);
      let text;
      if (takers.length === 0) {
        const share = Math.floor(team.pot / team.members.length);
        team.members.forEach(id => this.game.award(id, share));
        text = "Alle delte! Potten deles likt.";
      } else if (takers.length === 1) {
        this.game.award(takers[0].id, team.pot);
        text = `${takers[0].name} tok alt!`;
      } else {
        text = "Flere ville ta alt – ingen får noe!";
      }
      this.lines.push(`${this.names(team.members).join(", ")}: ${text}`);
      return { picks, text, pot: team.pot };
    });
    this.changed();
  }

  hostAction(action, data) {
    if (this.step === "play") {
      if (action === "guess") return this.guess(data.dir);
      if (action === "result") return this.result(data.ok);
      if (action === "stop") return this.stop();
    }
    if (action === "reveal") return this.reveal();
    if (action === "next" && this.step === "reveal") return this.finish();
    return super.hostAction(action);
  }

  playerAction(player, action, data) {
    if (action === "choose") {
      if (this.step !== "choice") throw new GameError("Ikke tid for å velge.");
      if (data.choice !== "share" && data.choice !== "take") throw new GameError("Ugyldig valg.");
      this.choices.set(player.id, data.choice);
      return this.changed();
    }
    if (this.step !== "play" || !this.team.members.includes(player.id)) throw new GameError("Det er ikke lagets tur.");
    if (action === "guess") return this.guess(data.dir);
    if (action === "result") return this.result(data.ok);
    if (action === "stop") return this.stop();
    return super.playerAction(player, action);
  }

  hostView() {
    const actions = [];
    if (this.step === "play") {
      const t = this.team;
      if (t.sub === "guess") {
        actions.push({ action: "guess", dir: "higher", label: "Høyere" });
        actions.push({ action: "guess", dir: "lower", label: "Lavere" });
        actions.push({ action: "stop", label: "Stopp og sikre potten" });
      } else {
        actions.push({ action: "result", ok: true, label: "Riktig" });
        actions.push({ action: "result", ok: false, label: "Feil" });
      }
    }
    if (this.step === "choice") actions.push({ action: "reveal", label: "Avslør valgene" });
    if (this.step === "reveal") actions.push({ action: "next", label: "Avslutt runden" });

    return {
      type: "alliance",
      step: this.step,
      potPerCorrect: C.POT_PER_CORRECT,
      maxGuesses: C.MAX_GUESSES,
      teams: this.teams.map((t, i) => ({
        names: this.names(t.members),
        members: t.members.map(id => this.publicPlayer(id)),
        pot: t.pot,
        guesses: t.guesses,
        history: t.history,
        status: t.status,
        current: i === this.teamIndex && this.step === "play",
        sub: t.sub,
        lastGuess: t.lastGuess,
        guesserName: this.name(t.members[t.guesser])
      })),
      chosen: this.choices.size,
      totalPlayers: this.activeParticipants().length,
      endsAt: this.step === "choice" ? this.endsAt : null,
      outcomes: this.step === "reveal" ? this.outcomes : null,
      actions
    };
  }

  playerView(player) {
    const team = this.teamOf(player.id);
    const view = {
      type: "alliance",
      step: this.step,
      myTeamNames: team ? this.names(team.members) : [],
      myPot: team ? team.pot : 0,
      myStatus: team ? team.status : null
    };
    if (this.step === "play") {
      const current = this.team;
      view.ourTurn = current === team;
      view.currentNames = this.names(current.members);
      if (view.ourTurn) {
        view.sub = current.sub;
        view.lastGuess = current.lastGuess;
        view.guesserName = this.name(current.members[current.guesser]);
        view.amGuesser = current.members[current.guesser] === player.id;
        view.guesses = current.guesses;
        view.maxGuesses = C.MAX_GUESSES;
        view.history = current.history;
      }
    }
    if (this.step === "choice") {
      view.endsAt = this.endsAt;
      view.myChoice = this.choices.get(player.id) || null;
    }
    if (this.step === "reveal") {
      view.myChoice = this.choices.get(player.id) || null;
      const i = this.teams.indexOf(team);
      view.outcome = i >= 0 ? this.outcomes[i] : null;
    }
    return view;
  }
}

module.exports = AllianceRound;

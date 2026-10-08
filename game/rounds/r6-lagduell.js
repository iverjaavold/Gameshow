/*
  Runde 6 – Lagduellen.
  Kvalifisering: raskest riktig på hvert lag blir lagets mester.
  Duell: mesterne svarer, første svar teller (feil gir poenget til motstanderen). Best av 5.
  Spørsmålene avsløres og går videre av seg selv.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { QuizQuestion } = require("./quiz");
const { botChoice } = require("./r2-konge");

const C = config.R6;

class TeamDuelRound extends Round {
  start() {
    this.teams = this.game.randomizer.twoTeams(this.participants);
    this.champions = [null, null];
    this.wins = [0, 0];
    this.step = "qual"; // qual | duel | done
    this.index = 0;
    this.event = null;
    this.nextQuestion();
  }

  teamOf(id) {
    return this.teams[0].includes(id) ? 0 : this.teams[1].includes(id) ? 1 : -1;
  }

  // Hvem kan svare på gjeldende spørsmål?
  eligible() {
    if (this.step === "qual") {
      return this.activeParticipants().filter(id => {
        const t = this.teamOf(id);
        return t >= 0 && !this.champions[t];
      });
    }
    if (this.step === "duel") return this.champions.slice();
    return [];
  }

  nextQuestion() {
    this.index++;
    this.event = null;
    this.firstAnswer = null;
    this.quiz = new QuizQuestion(this.game, this.options.leaderChoice, C.QUESTION_SECONDS);
    this.auto(() => this.reveal(), C.QUESTION_SECONDS);
    this.changed();
  }

  reveal() {
    if (this.quiz.revealed) return;
    this.quiz.revealed = true;

    if (this.step === "qual") {
      const correct = this.quiz.correctInOrder();
      const events = [];
      [0, 1].forEach(t => {
        if (this.champions[t]) return;
        const best = correct.find(c => this.teamOf(c.id) === t);
        if (best) {
          this.champions[t] = best.id;
          events.push(`${this.name(best.id)} er mester for lag ${t + 1}!`);
        }
      });
      this.event = events.join(" ") || "Ingen ny mester. Nytt spørsmål!";
    } else if (this.step === "duel") {
      const first = this.firstAnswer;
      if (!first) {
        this.event = "Ingen svarte. Ingen poeng.";
      } else {
        const t = this.teamOf(first.id);
        const correct = this.quiz.isCorrect(first.id);
        const winner = correct ? t : 1 - t;
        this.wins[winner]++;
        this.event = correct
          ? `${this.name(first.id)} var først og svarte riktig!`
          : `${this.name(first.id)} svarte feil – poenget går til ${this.name(this.champions[winner])}!`;
      }
    }
    this.auto(() => this.advance(), C.REVEAL_SECONDS);
    this.changed();
  }

  advance() {
    if (this.step === "done") return this.finish();
    if (!this.quiz.revealed) return this.reveal();
    if (this.step === "qual" && this.champions[0] && this.champions[1]) {
      this.step = "duel";
      this.index = 0;
      return this.nextQuestion();
    }
    if (this.step === "duel") {
      const winner = this.wins.findIndex(w => w >= C.DUEL_WINS_NEEDED);
      if (winner >= 0) return this.endDuel(winner);
    }
    return this.nextQuestion();
  }

  endDuel(winner) {
    this.step = "done";
    const champ = this.champions[winner];
    this.game.award(champ, C.CHAMPION_POINTS, { quiz: true });
    this.teams[winner].filter(id => id !== champ).forEach(id => this.game.award(id, C.TEAM_POINTS));
    this.event = `${this.name(champ)} vinner duellen for lag ${winner + 1}!`;
    this.lines = [this.event];
    this.auto(() => this.finish(), C.REVEAL_SECONDS * 2);
    this.changed();
  }

  forceEnd() {
    // Avsluttes duellen før tiden, vinner den som leder (hvis noen leder).
    if (this.step === "duel" && this.wins[0] !== this.wins[1]) this.endDuel(this.wins[0] > this.wins[1] ? 0 : 1);
    this.finish();
  }

  hostAction(action) {
    if (action === "reveal") return this.reveal();
    if (action === "next") return this.advance();
    return super.hostAction(action);
  }

  playerAction(player, action, data) {
    if (action !== "answer") return super.playerAction(player, action);
    if (!this.eligible().includes(player.id)) throw new GameError("Du skal ikke svare nå.");
    if (!this.quiz.answer(player.id, data.choice)) return;
    if (this.step === "duel") {
      if (!this.firstAnswer) this.firstAnswer = { id: player.id };
      return this.reveal();
    }
    if (this.eligible().every(id => this.quiz.answers.has(id))) this.reveal();
    this.changed();
  }

  botAct(bot) {
    if (this.step === "done" || this.quiz.revealed || this.quiz.answers.has(bot.id)) return;
    if (this.eligible().includes(bot.id) && this.chance(0.3)) {
      this.playerAction(bot, "answer", { choice: botChoice(this.quiz) });
    }
  }

  hostView() {
    const eligible = this.eligible();
    const menu = [];
    if (this.step !== "done" && !this.quiz.revealed) menu.push({ action: "reveal", label: "Avslør nå" });
    else menu.push({ action: "next", label: "Gå videre nå" });
    return {
      type: "teamDuel",
      step: this.step,
      teams: this.teams.map(t => t.map(id => this.publicPlayer(id))),
      champions: this.champions.map(id => (id ? this.name(id) : null)),
      championIds: this.champions,
      wins: this.wins,
      winsNeeded: C.DUEL_WINS_NEEDED,
      question: this.step === "done" ? null : this.quiz.publicView(),
      answered: eligible.filter(id => this.quiz.answers.has(id)).length,
      totalPlayers: eligible.length,
      firstName: this.firstAnswer ? this.name(this.firstAnswer.id) : null,
      event: this.quiz.revealed || this.step === "done" ? this.event : null,
      actions: [],
      menu
    };
  }

  playerView(player) {
    const team = this.teamOf(player.id);
    const canAnswer = this.eligible().includes(player.id) && this.step !== "done";
    return {
      type: "teamDuel",
      step: this.step,
      team: team + 1,
      isChampion: this.champions.includes(player.id),
      canAnswer,
      wins: this.wins,
      myTeamIndex: team,
      question: canAnswer || this.quiz.revealed ? this.quiz.playerView(player.id) : null,
      event: this.quiz.revealed || this.step === "done" ? this.event : null
    };
  }
}

module.exports = TeamDuelRound;

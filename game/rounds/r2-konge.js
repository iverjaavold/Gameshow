/*
  Runde 2 – Kongen på haugen.
  Raskest og riktig blir konge. Kongen får bonus for hvert spørsmål tronen holdes.
  Spørsmålene avsløres og går videre av seg selv.
*/

const config = require("../config");
const { Round } = require("./base");
const { QuizQuestion } = require("./quiz");

const C = config.R2;

class KingRound extends Round {
  start() {
    this.index = 0;
    this.kingId = null;
    this.event = null; // tekst om hva som skjedde ved siste avsløring
    this.nextQuestion();
  }

  nextQuestion() {
    this.index++;
    this.event = null;
    this.quiz = new QuizQuestion(this.game, this.options.leaderChoice, C.QUESTION_SECONDS);
    this.auto(() => this.reveal(), C.QUESTION_SECONDS);
    this.changed();
  }

  reveal() {
    if (this.quiz.revealed) return;
    this.quiz.revealed = true;

    const correct = this.quiz.correctInOrder();
    correct.forEach(({ id }) => this.game.award(id, C.CORRECT_POINTS, { quiz: true }));

    const fastest = correct[0];
    if (fastest && fastest.id !== this.kingId) {
      const old = this.kingId;
      this.kingId = fastest.id;
      this.event = old
        ? `${this.name(fastest.id)} veltet ${this.name(old)} og er ny konge!`
        : `${this.name(fastest.id)} er første konge!`;
    } else if (this.kingId) {
      if (!this.game.consumeBonusBlock(this.kingId, "kongebonusen")) {
        this.game.award(this.kingId, C.THRONE_BONUS);
      }
      this.event = `${this.name(this.kingId)} holder tronen!`;
    } else {
      this.event = "Ingen svarte riktig.";
    }
    this.fastest = fastest ? { name: this.name(fastest.id), seconds: (fastest.ms / 1000).toFixed(1) } : null;
    this.game.crownId = this.kingId;
    this.auto(() => this.next(), C.REVEAL_SECONDS);
    this.changed();
  }

  next() {
    if (!this.quiz.revealed) return this.reveal();
    if (this.index >= C.QUESTIONS) return this.finish();
    return this.nextQuestion();
  }

  hostAction(action) {
    if (action === "reveal") return this.reveal();
    if (action === "next") return this.next();
    return super.hostAction(action);
  }

  playerAction(player, action, data) {
    if (action !== "answer") return super.playerAction(player, action);
    if (this.quiz.answer(player.id, data.choice)) {
      if (this.allIn(this.quiz.answers)) this.reveal();
      this.changed();
    }
  }

  botAct(bot) {
    if (!this.quiz.revealed && !this.quiz.answers.has(bot.id) && this.chance(0.35)) {
      this.playerAction(bot, "answer", { choice: this.quiz.revealed ? 0 : botChoice(this.quiz) });
    }
  }

  summary() {
    return this.kingId ? [`${this.name(this.kingId)} endte som konge!`] : [];
  }

  hostView() {
    const revealed = this.quiz.revealed;
    return {
      type: "quiz",
      index: this.index,
      total: C.QUESTIONS,
      question: this.quiz.publicView(),
      answered: this.activeParticipants().filter(id => this.quiz.answers.has(id)).length,
      totalPlayers: this.activeParticipants().length,
      kingName: this.kingId ? this.name(this.kingId) : null,
      event: revealed ? this.event : null,
      fastest: revealed ? this.fastest : null,
      actions: [],
      menu: [revealed ? { action: "next", label: "Neste spørsmål nå" } : { action: "reveal", label: "Avslør nå" }]
    };
  }

  playerView(player) {
    return {
      type: "quiz",
      index: this.index,
      total: C.QUESTIONS,
      question: this.quiz.playerView(player.id),
      isKing: this.kingId === player.id,
      event: this.quiz.revealed ? this.event : null
    };
  }
}

// Bots svarer riktig av og til
function botChoice(quiz) {
  return Math.random() < 0.4 ? quiz.q.correct : Math.floor(Math.random() * 4);
}

module.exports = KingRound;
module.exports.botChoice = botChoice;

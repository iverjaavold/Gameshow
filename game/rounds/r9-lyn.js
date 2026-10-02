/*
  Runde 9 – Lynrunden.
  Raske spørsmål som går automatisk videre. Doble poeng for alle (se Game.award).
*/

const config = require("../config");
const { Round } = require("./base");
const { QuizQuestion } = require("./quiz");

const C = config.R9;

class LightningRound extends Round {
  start() {
    this.index = 0;
    this.paused = false;
    this.nextQuestion();
  }

  nextQuestion() {
    this.index++;
    this.quiz = new QuizQuestion(this.game, this.options.leaderChoice, C.QUESTION_SECONDS);
    this.stepTimer = this.timer(() => this.reveal(), C.QUESTION_SECONDS * 1000);
    this.changed();
  }

  reveal() {
    if (this.quiz.revealed) return;
    this.clearTimer(this.stepTimer);
    this.quiz.revealed = true;
    this.quiz.correctInOrder().forEach(({ id }) => this.game.award(id, C.CORRECT_POINTS, { quiz: true }));
    this.revealEndsAt = Date.now() + C.REVEAL_SECONDS * 1000;
    if (!this.paused) this.stepTimer = this.timer(() => this.advance(), C.REVEAL_SECONDS * 1000);
    this.changed();
  }

  advance() {
    if (this.index >= C.QUESTIONS) return this.finish();
    this.nextQuestion();
  }

  hostAction(action) {
    if (action === "pause") {
      this.paused = true;
      if (this.quiz.revealed) this.clearTimer(this.stepTimer);
      return this.changed();
    }
    if (action === "resume") {
      this.paused = false;
      if (this.quiz.revealed) this.advance();
      return this.changed();
    }
    if (action === "next") {
      if (!this.quiz.revealed) return this.reveal();
      this.clearTimer(this.stepTimer);
      return this.advance();
    }
    return super.hostAction(action);
  }

  playerAction(player, action, data) {
    if (action !== "answer") return super.playerAction(player, action);
    if (this.quiz.answer(player.id, data.choice)) {
      if (this.activeParticipants().every(id => this.quiz.answers.has(id))) this.reveal();
      this.changed();
    }
  }

  hostView() {
    const ids = this.activeParticipants();
    return {
      type: "quiz",
      index: this.index,
      total: C.QUESTIONS,
      question: this.quiz.publicView(),
      answered: ids.filter(id => this.quiz.answers.has(id)).length,
      totalPlayers: ids.length,
      banner: "DOBLE POENG",
      correctNames: this.quiz.revealed ? this.names(this.quiz.correctInOrder().map(c => c.id)) : null,
      actions: [
        this.paused ? { action: "resume", label: "Fortsett" } : { action: "pause", label: "Pause" },
        { action: "next", label: "Hopp videre" }
      ]
    };
  }

  playerView(player) {
    return {
      type: "quiz",
      index: this.index,
      total: C.QUESTIONS,
      question: this.quiz.playerView(player.id),
      banner: "Doble poeng!"
    };
  }
}

module.exports = LightningRound;

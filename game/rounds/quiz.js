/*
  Felles quizhjelper: trekker et spørsmål som ikke er brukt før i spillet,
  stokker alternativene og samler svar med tidspunkt.
*/

const { QUESTIONS } = require("../content");
const { pick, shuffle, ms } = require("../util");

function drawQuestion(game, category) {
  const unused = QUESTIONS.filter(q => !game.usedQuestions.has(q));
  let pool = category ? unused.filter(q => q.c === category) : unused;
  if (!pool.length) pool = unused;
  if (!pool.length) {
    game.usedQuestions.clear();
    pool = QUESTIONS;
  }
  const q = pick(pool);
  game.usedQuestions.add(q);
  const order = shuffle([0, 1, 2, 3]);
  return {
    category: q.c,
    text: q.q,
    options: order.map(i => q.a[i]),
    correct: order.indexOf(q.r)
  };
}

class QuizQuestion {
  constructor(game, category, seconds) {
    this.q = drawQuestion(game, category);
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + ms(seconds);
    this.answers = new Map(); // playerId -> { choice, at }
    this.revealed = false;
  }

  answer(playerId, choice) {
    choice = Number(choice);
    if (this.revealed || this.answers.has(playerId)) return false;
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return false;
    this.answers.set(playerId, { choice, at: Date.now() });
    return true;
  }

  // Testmodus: bot svarer riktig med en viss sannsynlighet
  botAnswer(playerId, correctChance = 0.4) {
    const choice = Math.random() < correctChance ? this.q.correct : Math.floor(Math.random() * 4);
    return this.answer(playerId, choice);
  }

  isCorrect(playerId) {
    const a = this.answers.get(playerId);
    return !!a && a.choice === this.q.correct;
  }

  // Riktige svar sortert etter tid (raskest først).
  correctInOrder() {
    return [...this.answers.entries()]
      .filter(([, a]) => a.choice === this.q.correct)
      .sort((a, b) => a[1].at - b[1].at)
      .map(([id, a]) => ({ id, ms: a.at - this.startedAt }));
  }

  publicView() {
    return {
      category: this.q.category,
      text: this.q.text,
      options: this.q.options,
      endsAt: this.revealed ? null : this.endsAt,
      revealed: this.revealed,
      correct: this.revealed ? this.q.correct : null
    };
  }

  playerView(playerId) {
    const mine = this.answers.get(playerId);
    return {
      ...this.publicView(),
      myAnswer: mine ? mine.choice : null,
      wasCorrect: this.revealed && mine ? mine.choice === this.q.correct : null
    };
  }
}

module.exports = { QuizQuestion, drawQuestion };

/*
  Runde 9 – Lynrunden (buzzer).
  Nedtelling fra 10, så 5 spørsmål på hovedskjermen. Alle har en rød buzzer på mobilen.
  Først på buzzeren svarer høyt og har 5 sekunder. Hosten trykker grønn (+200) eller rød (−100),
  og appen går videre av seg selv. Trykker ingen innen 10 sekunder, hoppes spørsmålet over.
  Fasiten vises sløret for hosten (hold musen over for å se den) og avsløres etter vurderingen.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { LYN_QUESTIONS } = require("../content-mini");
const { pick } = require("../util");

const C = config.R9;

class LightningRound extends Round {
  start() {
    this.index = 0;
    this.step = "countdown"; // countdown | question | answering | reveal
    this.auto(() => this.nextQuestion(), C.START_COUNTDOWN);
    this.changed();
  }

  drawQuestion() {
    let pool = LYN_QUESTIONS.filter(q => !this.game.usedContent.has(q));
    if (!pool.length) pool = LYN_QUESTIONS;
    const q = pick(pool);
    this.game.usedContent.add(q);
    return q;
  }

  nextQuestion() {
    if (this.index >= C.QUESTIONS) return this.finish();
    this.index++;
    this.q = this.drawQuestion();
    this.step = "question";
    this.buzzerId = null;
    this.result = null;
    this.auto(() => this.skip(), C.BUZZ_SECONDS);
    this.changed();
  }

  buzz(player) {
    if (this.step !== "question") throw new GameError("For sent!");
    this.buzzerId = player.id;
    this.step = "answering";
    // Svartiden vises som nedtelling. Hosten vurderer – appen venter på grønn/rød.
    this.cancelAuto();
    this.answerEndsAt = this.at(C.ANSWER_SECONDS);
    this.changed();
  }

  judge(ok) {
    if (this.step !== "answering") throw new GameError("Ingen svarer nå.");
    if (ok) {
      this.game.award(this.buzzerId, C.CORRECT_POINTS, { quiz: true });
      this.result = `${this.name(this.buzzerId)} svarte riktig! +${C.CORRECT_POINTS}`;
    } else {
      this.game.adjust(this.buzzerId, C.WRONG_POINTS);
      this.result = `${this.name(this.buzzerId)} svarte feil. ${C.WRONG_POINTS}`;
    }
    this.toReveal();
  }

  skip() {
    if (this.step !== "question") return;
    this.result = "Ingen trykket. Spørsmålet hoppes over.";
    this.toReveal();
  }

  toReveal() {
    this.step = "reveal";
    this.auto(() => this.nextQuestion(), C.REVEAL_SECONDS);
    this.changed();
  }

  hostAction(action) {
    if (action === "right") return this.judge(true);
    if (action === "wrong") return this.judge(false);
    if (action === "skip") {
      if (this.step === "countdown") return this.nextQuestion();
      if (this.step === "question") return this.skip();
      if (this.step === "reveal") return this.nextQuestion();
      return;
    }
    return super.hostAction(action);
  }

  playerAction(player, action) {
    if (action === "buzz") return this.buzz(player);
    return super.playerAction(player, action);
  }

  botAct(bot) {
    if (this.step === "question" && this.chance(0.12)) this.buzz(bot);
  }

  hostView() {
    const actions = [];
    const menu = [];
    if (this.step === "answering") {
      actions.push({ action: "right", label: `Riktig (+${C.CORRECT_POINTS})`, style: "good" });
      actions.push({ action: "wrong", label: `Feil (${C.WRONG_POINTS})`, style: "bad" });
    } else {
      menu.push({ action: "skip", label: "Hopp videre" });
    }
    return {
      type: "lyn",
      step: this.step,
      index: this.index,
      total: C.QUESTIONS,
      countdownEndsAt: this.step === "countdown" ? this.autoAt : null,
      question: this.step === "countdown" ? null : this.q.q,
      // Fasiten: sløret for hosten mens noen svarer, åpen etter vurderingen
      answer: this.step === "answering" || this.step === "reveal" ? this.q.a : null,
      buzzEndsAt: this.step === "question" ? this.autoAt : null,
      buzzer: this.buzzerId ? this.publicPlayer(this.buzzerId) : null,
      answerEndsAt: this.step === "answering" ? this.answerEndsAt : null,
      result: this.step === "reveal" ? this.result : null,
      actions,
      menu
    };
  }

  playerView(player) {
    return {
      type: "lyn",
      step: this.step,
      index: this.index,
      total: C.QUESTIONS,
      countdownEndsAt: this.step === "countdown" ? this.autoAt : null,
      canBuzz: this.step === "question",
      iBuzzed: this.buzzerId === player.id,
      buzzerName: this.buzzerId ? this.name(this.buzzerId) : null,
      answerEndsAt: this.step === "answering" ? this.answerEndsAt : null,
      result: this.step === "reveal" ? this.result : null
    };
  }
}

module.exports = LightningRound;

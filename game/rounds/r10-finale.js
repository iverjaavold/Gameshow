/*
  Runde 10 – Finale: Del eller stjel.
  De to beste bygger en pott med raske spørsmål. Alle andre satser på hva finalistene velger.
  Til slutt velger finalistene «Del» eller «Stjel» i hemmelighet, og valgene avsløres samtidig.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { QuizQuestion } = require("./quiz");
const { shuffle } = require("../util");

const C = config.R10;
const OUTCOMES = ["bothShare", "aSteals", "bSteals", "bothSteal"];

class FinalRound extends Round {
  start() {
    const ranked = shuffle(this.activeParticipants())
      .map(id => this.player(id))
      .sort((a, b) => b.score - a.score);
    this.finalists = ranked.slice(0, 2).map(p => p.id);
    this.pot = C.BASE_POT;
    this.index = 0;
    this.step = "pot"; // pot | choice | reveal
    this.bets = new Map(); // tilskuer -> { outcome, stake }
    this.choices = new Map(); // finalist -> share | steal
    this.nextQuestion();
  }

  isFinalist(id) {
    return this.finalists.includes(id);
  }

  nextQuestion() {
    this.index++;
    this.quiz = new QuizQuestion(this.game, null, C.QUESTION_SECONDS);
    this.questionTimer = this.timer(() => this.reveal(), C.QUESTION_SECONDS * 1000);
    this.changed();
  }

  reveal() {
    if (this.quiz.revealed) return;
    this.clearTimer(this.questionTimer);
    this.quiz.revealed = true;
    this.added = this.quiz.correctInOrder().length * C.POT_PER_CORRECT;
    this.pot += this.added;
    this.changed();
  }

  startChoice() {
    this.step = "choice";
    this.endsAt = Date.now() + C.CHOICE_SECONDS * 1000;
    this.choiceTimer = this.timer(() => this.revealChoices(), C.CHOICE_SECONDS * 1000);
    this.changed();
  }

  outcomeLabel(outcome) {
    const [a, b] = this.names(this.finalists);
    return {
      bothShare: "Begge deler",
      aSteals: `${a} stjeler`,
      bSteals: `${b} stjeler`,
      bothSteal: "Begge stjeler"
    }[outcome];
  }

  revealChoices() {
    if (this.step !== "choice") return;
    this.clearTimer(this.choiceTimer);
    this.step = "reveal";
    const [a, b] = this.finalists;
    const sa = this.choices.get(a) === "steal";
    const sb = this.choices.get(b) === "steal";
    let outcome;
    if (!sa && !sb) {
      outcome = "bothShare";
      const half = Math.floor(this.pot / 2);
      this.payout(a, half);
      this.payout(b, half);
    } else if (sa && !sb) {
      outcome = "aSteals";
      this.payout(a, this.pot);
    } else if (!sa && sb) {
      outcome = "bSteals";
      this.payout(b, this.pot);
    } else {
      outcome = "bothSteal";
    }
    this.outcome = outcome;

    this.bets.forEach((bet, id) => {
      const player = this.player(id);
      if (!player || !bet.stake) return;
      if (bet.outcome === outcome) {
        this.game.adjust(id, bet.stake * C.SPECTATOR_BET_PAYOUT);
        this.game.toast(player, `Riktig spådd! Du vant ${bet.stake * C.SPECTATOR_BET_PAYOUT} poeng.`);
      } else {
        this.game.adjust(id, -bet.stake);
        this.game.toast(player, `Feil spådom. Du tapte ${bet.stake} poeng.`);
      }
    });
    this.lines = [this.outcomeLabel(outcome) + "!"];
    this.changed();
  }

  // Finalepotten dobles ikke av catch-up; den er en felles pott.
  payout(id, amount) {
    const player = this.player(id);
    if (!player) return;
    player.roundBase += amount;
    this.game.adjust(id, amount);
  }

  hostAction(action) {
    if (this.step === "pot") {
      if (action === "reveal") return this.reveal();
      if (action === "next") {
        if (!this.quiz.revealed) return this.reveal();
        if (this.index >= C.QUESTIONS) return this.startChoice();
        return this.nextQuestion();
      }
      if (action === "toChoice") return this.startChoice();
    }
    if (this.step === "choice" && action === "reveal") {
      if (this.finalists.some(id => !this.choices.has(id))) throw new GameError("Begge finalistene må velge først.");
      return this.revealChoices();
    }
    if (this.step === "reveal" && action === "next") return this.finish();
    return super.hostAction(action);
  }

  playerAction(player, action, data) {
    if (action === "answer") {
      if (!this.isFinalist(player.id) || this.step !== "pot") throw new GameError("Bare finalistene svarer.");
      if (this.quiz.answer(player.id, data.choice)) {
        if (this.finalists.every(id => this.quiz.answers.has(id))) this.reveal();
        this.changed();
      }
      return;
    }
    if (action === "choose") {
      if (!this.isFinalist(player.id) || this.step !== "choice") throw new GameError("Ikke tilgjengelig.");
      if (data.choice !== "share" && data.choice !== "steal") throw new GameError("Ugyldig valg.");
      this.choices.set(player.id, data.choice);
      return this.changed();
    }
    if (action === "bet") {
      if (this.isFinalist(player.id)) throw new GameError("Finalistene kan ikke satse.");
      if (this.step !== "pot") throw new GameError("Innsatsene er låst.");
      if (!OUTCOMES.includes(data.outcome)) throw new GameError("Velg et utfall.");
      const stake = Math.floor(Number(data.stake));
      if (!Number.isFinite(stake) || stake < 0 || stake > player.score) throw new GameError("Ugyldig innsats.");
      this.bets.set(player.id, { outcome: data.outcome, stake });
      return this.changed();
    }
    return super.playerAction(player, action);
  }

  hostView() {
    const [a, b] = this.finalists;
    const actions = [];
    if (this.step === "pot") {
      if (!this.quiz.revealed) actions.push({ action: "reveal", label: "Avslør nå" });
      else actions.push({ action: "next", label: this.index >= C.QUESTIONS ? "Til det store valget" : "Neste spørsmål" });
    }
    if (this.step === "choice") actions.push({ action: "reveal", label: "Avslør valgene" });
    if (this.step === "reveal") actions.push({ action: "next", label: "Se resultatet" });
    return {
      type: "final",
      step: this.step,
      finalists: [this.publicPlayer(a), this.publicPlayer(b)],
      pot: this.pot,
      index: this.index,
      total: C.QUESTIONS,
      question: this.step === "pot" ? this.quiz.publicView() : null,
      answered: this.finalists.filter(id => this.quiz.answers.has(id)).length,
      correctNames: this.step === "pot" && this.quiz.revealed ? this.names(this.quiz.correctInOrder().map(c => c.id)) : null,
      betsPlaced: this.bets.size,
      spectators: this.activeParticipants().length - 2,
      chosen: this.choices.size,
      endsAt: this.step === "choice" ? this.endsAt : null,
      reveal: this.step === "reveal"
        ? { choices: this.finalists.map(id => this.choices.get(id) || "share"), outcome: this.outcomeLabel(this.outcome) }
        : null,
      actions
    };
  }

  playerView(player) {
    const finalist = this.isFinalist(player.id);
    const view = {
      type: "final",
      step: this.step,
      finalist,
      finalistNames: this.names(this.finalists),
      pot: this.pot
    };
    if (finalist) {
      if (this.step === "pot") {
        view.question = this.quiz.playerView(player.id);
        view.index = this.index;
        view.total = C.QUESTIONS;
      }
      if (this.step === "choice") view.endsAt = this.endsAt;
      view.myChoice = this.choices.get(player.id) || null;
    } else {
      view.outcomes = OUTCOMES.map(id => ({ id, label: this.outcomeLabel(id) }));
      view.myBet = this.bets.get(player.id) || null;
      view.maxStake = player.score;
      view.payout = C.SPECTATOR_BET_PAYOUT;
    }
    if (this.step === "reveal") {
      view.reveal = { choices: this.finalists.map(id => this.choices.get(id) || "share"), outcome: this.outcomeLabel(this.outcome) };
    }
    return view;
  }
}

module.exports = FinalRound;

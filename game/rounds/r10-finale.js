/*
  Runde 10 – Finale: Del eller stjel.
  De to beste bygger en pott med raske spørsmål. Alle andre satser på hva finalistene velger.
  Til slutt velger finalistene «Del» eller «Stjel» i hemmelighet, og valgene avsløres samtidig.
  Alt går av seg selv.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { QuizQuestion } = require("./quiz");
const { botChoice } = require("./r2-konge");
const { shuffle, pick, randInt } = require("../util");

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
    this.auto(() => this.reveal(), C.QUESTION_SECONDS);
    this.changed();
  }

  reveal() {
    if (this.quiz.revealed) return;
    this.quiz.revealed = true;
    this.added = this.quiz.correctInOrder().length * C.POT_PER_CORRECT;
    this.pot += this.added;
    this.auto(() => this.next(), C.REVEAL_SECONDS);
    this.changed();
  }

  next() {
    if (this.step !== "pot") return;
    if (!this.quiz.revealed) return this.reveal();
    if (this.index >= C.QUESTIONS) return this.startChoice();
    return this.nextQuestion();
  }

  startChoice() {
    this.step = "choice";
    this.auto(() => this.revealChoices(), C.CHOICE_SECONDS);
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
    this.auto(() => this.finish(), C.REVEAL_END_SECONDS);
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
      if (action === "next") return this.next();
      if (action === "toChoice") return this.startChoice();
    }
    if (this.step === "choice" && action === "reveal") return this.revealChoices();
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
      // Begge har valgt: avslør etter en kort pause (man kan ombestemme seg til da).
      if (this.finalists.every(id => this.choices.has(id))) this.soon(() => this.revealChoices());
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

  botAct(bot) {
    if (this.isFinalist(bot.id)) {
      if (this.step === "pot" && !this.quiz.revealed && !this.quiz.answers.has(bot.id) && this.chance(0.4)) {
        this.playerAction(bot, "answer", { choice: botChoice(this.quiz) });
      }
      if (this.step === "choice" && !this.choices.has(bot.id) && this.chance(0.3)) {
        this.playerAction(bot, "choose", { choice: this.chance(0.5) ? "share" : "steal" });
      }
    } else if (this.step === "pot" && !this.bets.has(bot.id) && this.chance(0.2)) {
      this.playerAction(bot, "bet", { outcome: pick(OUTCOMES), stake: randInt(0, Math.floor(bot.score * 0.3)) });
    }
  }

  hostView() {
    const [a, b] = this.finalists;
    const menu = [];
    if (this.step === "pot") menu.push(this.quiz.revealed ? { action: "next", label: "Neste spørsmål nå" } : { action: "reveal", label: "Avslør nå" });
    if (this.step === "choice") menu.push({ action: "reveal", label: "Avslør valgene nå" });
    if (this.step === "reveal") menu.push({ action: "next", label: "Se resultatet nå" });
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
      endsAt: this.step === "choice" ? this.autoAt : null,
      reveal: this.step === "reveal"
        ? { choices: this.finalists.map(id => this.choices.get(id) || "share"), outcome: this.outcomeLabel(this.outcome) }
        : null,
      actions: [],
      menu
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
      if (this.step === "choice") view.endsAt = this.autoAt;
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

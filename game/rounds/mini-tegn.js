/*
  Minirunde – Tegn ordet.
  Én spiller om gangen får et ord på mobilen og tegner det med fingeren. Tegningen vises
  live på hovedskjermen. De andre skriver hva de tror det er (så mange ganger de vil).
  Riktig gjetning gir poeng (først gir mest). Tegneren får poeng for hver som gjetter riktig.
  Rollen går på rundgang, så alle får tegne (opptil TURNS_MAX).

  Klassen brukes også av «Nynn sangen» (mini-nynn.js), som bare bytter innhold og visning.
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { DRAW_WORDS } = require("../content-mini");
const { shuffle, pick, ms } = require("../util");
const text = require("../text");

const MAX_POINTS = 6000; // tak på antall punkter i en tegning
const COLORS = ["#111111", "#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa"];

class GuessTurnRound extends Round {
  get C() {
    return config.TEGN;
  }

  get type() {
    return "tegn";
  }

  // Innhold: { label, answers }
  pickPrompt() {
    let pool = DRAW_WORDS.filter(w => !this.game.usedContent.has(w));
    if (!pool.length) pool = DRAW_WORDS;
    const word = pick(pool);
    this.game.usedContent.add(word);
    return { label: word, answers: [word] };
  }

  start() {
    const ids = this.activeParticipants();
    this.order = shuffle(ids).slice(0, Math.min(this.C.TURNS_MAX, ids.length));
    this.turn = 0;
    if (ids.length < 2) {
      this.step = "skip";
      this.lines.push("For få spillere – trenger minst 2.");
      return this.auto(() => this.finish(), 3);
    }
    this.nextTurn();
  }

  nextTurn() {
    if (this.turn >= this.order.length) return this.finish();
    this.turn++;
    this.performerId = this.order[this.turn - 1];
    this.prompt = this.pickPrompt();
    this.solved = new Map(); // spiller -> poeng
    this.cooldown = new Map();
    this.strokes = [];
    this.points = 0;
    this.step = "ready"; // ready | play | reveal
    this.auto(() => this.startPlay(), this.C.READY_SECONDS);
    this.changed();
  }

  startPlay() {
    if (this.step !== "ready") return;
    this.step = "play";
    this.auto(() => this.reveal(), this.C.TURN_SECONDS);
    this.changed();
  }

  guessers() {
    return this.activeParticipants().filter(id => id !== this.performerId);
  }

  guess(player, guessText) {
    if (this.step !== "play") throw new GameError("Vent til turen starter.");
    if (player.id === this.performerId) throw new GameError("Du kan ikke gjette selv!");
    if (this.solved.has(player.id)) return;
    const until = this.cooldown.get(player.id) || 0;
    if (this.game.now() < until) throw new GameError("Vent litt før du gjetter igjen.");
    const normalized = text.normalize(guessText);
    if (!normalized) throw new GameError("Skriv et svar.");
    const correct = this.prompt.answers.some(a => text.sameNormalized(text.normalize(a), normalized));
    if (!correct) {
      this.cooldown.set(player.id, this.game.now() + ms(this.C.WRONG_COOLDOWN_SECONDS));
      this.changed();
      return false;
    }
    const place = this.solved.size;
    const points = this.C.GUESS_POINTS[Math.min(place, this.C.GUESS_POINTS.length - 1)];
    this.solved.set(player.id, points);
    this.game.award(player.id, points);
    this.game.award(this.performerId, this.C.PERFORMER_POINTS);
    if (this.allIn(this.solved, this.guessers())) this.soon(() => this.reveal());
    this.changed();
    return true;
  }

  // Tegning: { i: strekindeks, c: fargeindeks, p: [[x, y], ...] } med koordinater 0–1000
  stroke(player, data) {
    if (this.step !== "play" || player.id !== this.performerId) return;
    const i = Math.floor(Number(data.i));
    if (!Number.isFinite(i) || i < 0 || i > this.strokes.length) return;
    const pts = (Array.isArray(data.p) ? data.p : [])
      .filter(p => Array.isArray(p) && p.length === 2)
      .map(([x, y]) => [Math.max(0, Math.min(1000, Math.round(x))), Math.max(0, Math.min(1000, Math.round(y)))]);
    if (this.points + pts.length > MAX_POINTS) return;
    this.points += pts.length;
    if (i === this.strokes.length) this.strokes.push({ c: COLORS[Number(data.c)] || COLORS[0], p: [] });
    this.strokes[i].p.push(...pts);
    this.changed();
  }

  reveal() {
    if (this.step === "reveal") return;
    this.step = "reveal";
    const n = this.solved.size;
    this.lines.push(`${this.name(this.performerId)}: «${this.prompt.label}» – ${n} gjettet riktig.`);
    this.auto(() => this.nextTurn(), this.C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "guess") return this.guess(player, data.text);
    if (action === "stroke") return this.stroke(player, data);
    if (action === "clear") {
      if (this.step === "play" && player.id === this.performerId) {
        this.strokes = [];
        this.points = 0;
        this.changed();
      }
      return;
    }
    if (action === "start") {
      if (player.id === this.performerId) this.startPlay();
      return;
    }
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") {
      if (this.step === "ready") return this.startPlay();
      if (this.step === "play") return this.reveal();
      return this.nextTurn();
    }
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "play") return;
    if (bot.id === this.performerId) {
      if (this.type === "tegn" && this.chance(0.3)) {
        const x = Math.random() * 1000, y = Math.random() * 1000;
        this.stroke(bot, { i: this.strokes.length, c: Math.floor(Math.random() * 3), p: [[x, y], [x + 150, y + 80], [x + 60, y + 200]] });
      }
      return;
    }
    if (this.solved.has(bot.id) || this.game.now() < (this.cooldown.get(bot.id) || 0)) return;
    if (this.chance(0.06)) this.guess(bot, this.chance(0.5) ? this.prompt.answers[0] : "noe annet");
  }

  hostView() {
    const menu = [];
    if (this.step === "ready") menu.push({ action: "next", label: "Start nå" });
    if (this.step === "play") menu.push({ action: "next", label: "Avslør nå" });
    if (this.step === "reveal") menu.push({ action: "next", label: "Neste nå" });
    return {
      type: this.type,
      step: this.step,
      turn: this.turn,
      turns: this.order.length,
      endsAt: this.autoAt,
      performer: this.publicPlayer(this.performerId),
      strokes: this.type === "tegn" ? this.strokes : null,
      players: this.guessers().map(id => ({ ...this.publicPlayer(id), solved: this.solved.has(id) })),
      answer: this.step === "reveal" ? this.prompt.label : null,
      actions: [],
      menu
    };
  }

  playerView(player) {
    const performer = player.id === this.performerId;
    return {
      type: this.type,
      step: this.step,
      turn: this.turn,
      turns: this.order.length,
      endsAt: this.autoAt,
      performer,
      performerName: this.name(this.performerId),
      turnKey: `${this.turn}`,
      prompt: performer || this.step === "reveal" ? this.prompt.label : null,
      colors: COLORS,
      solved: this.solved.has(player.id),
      points: this.solved.get(player.id) || null,
      solvedCount: this.solved.size,
      guesserCount: this.guessers().length,
      cooldownUntil: this.cooldown.get(player.id) || null
    };
  }
}

module.exports = GuessTurnRound;

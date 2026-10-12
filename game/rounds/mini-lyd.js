/*
  Minirunde – Gjett dyrelyden.
  Hovedskjermen spiller av fem dyrelyder, én om gangen. Den første er lett, og de blir
  vanskeligere utover. Alle skriver hvilket dyr det er på mobilen (flere forsøk, kort pause
  etter feil). Først riktig får mest.

  Lydfilene legges i assets/lyder/ og beskrives i assets/lyder/lyder.json
  med godkjente svar og vanskelighetsgrad 1–5 (se lyder.eksempel.json og README).
  Uten lyder kan ikke spillet velges.
*/

const fs = require("fs");
const path = require("path");
const config = require("../config");
const { Round, GameError } = require("./base");
const { shuffle, ms } = require("../util");
const text = require("../text");

const C = config.LYD;

function loadSounds() {
  const file = path.join(__dirname, "..", "..", C.FOLDER, "lyder.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
      .filter(x => x && x.fil && Array.isArray(x.svar) && x.svar.length)
      .map(x => ({ src: `${C.FOLDER}/${x.fil}`, answers: x.svar.map(String), level: Number(x["nivå"] ?? x.niva ?? x.level) || 3 }));
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Kunne ikke lese lyder.json:", err.message);
    return [];
  }
}

const BANK = loadSounds();

class SoundRound extends Round {
  static available() {
    return BANK.length > 0;
  }

  start() {
    // Fem lyder med stigende vanskelighet: helst ubrukte, sortert etter nivå
    let pool = BANK.filter(s => !this.game.usedContent.has(s));
    if (pool.length < C.SOUNDS) pool = BANK;
    this.sounds = shuffle(pool).slice(0, C.SOUNDS).sort((a, b) => a.level - b.level);
    this.sounds.forEach(s => this.game.usedContent.add(s));
    this.index = 0;
    if (!this.sounds.length) {
      this.step = "skip";
      this.lines.push("Ingen lydfiler er lagt inn.");
      return this.auto(() => this.finish(), 3);
    }
    this.nextSound();
  }

  nextSound() {
    if (this.index >= this.sounds.length) return this.finish();
    this.index++;
    this.sound = this.sounds[this.index - 1];
    this.step = "listen"; // listen | reveal
    this.playId = (this.playId || 0) + 1;
    this.solved = new Map();
    this.cooldown = new Map();
    this.auto(() => this.reveal(), C.GUESS_SECONDS);
    this.changed();
  }

  guess(player, guessText) {
    if (this.step !== "listen") throw new GameError("For sent.");
    if (this.solved.has(player.id)) return;
    const until = this.cooldown.get(player.id) || 0;
    if (this.game.now() < until) throw new GameError(`Vent ${Math.ceil((until - this.game.now()) / ms(1))} sekunder.`);
    const normalized = text.normalize(guessText);
    if (!normalized) throw new GameError("Skriv et svar.");
    const correct = this.sound.answers.some(a => text.sameNormalized(text.normalize(a), normalized));
    if (correct) {
      const points = C.POINTS[Math.min(this.solved.size, C.POINTS.length - 1)];
      this.solved.set(player.id, points);
      this.game.award(player.id, points);
      if (this.allIn(this.solved)) this.soon(() => this.reveal());
    } else {
      this.cooldown.set(player.id, this.game.now() + ms(C.WRONG_COOLDOWN_SECONDS));
    }
    this.changed();
    return correct;
  }

  reveal() {
    if (this.step !== "listen") return;
    this.step = "reveal";
    this.auto(() => this.nextSound(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "guess") return this.guess(player, data.text);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "replay") {
      this.playId++;
      return this.changed();
    }
    if (action === "next") return this.step === "listen" ? this.reveal() : this.nextSound();
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "listen" || this.solved.has(bot.id) || this.game.now() < (this.cooldown.get(bot.id) || 0)) return;
    if (this.chance(0.12)) this.guess(bot, this.chance(0.5) ? this.sound.answers[0] : "noe annet");
  }

  hostView() {
    return {
      type: "lyd",
      step: this.step,
      index: this.index,
      total: this.sounds.length,
      src: this.sound ? this.sound.src : null,
      playId: this.playId,
      level: this.sound ? this.sound.level : null,
      endsAt: this.step === "listen" ? this.autoAt : null,
      players: this.activeParticipants().map(id => ({ ...this.publicPlayer(id), solved: this.solved && this.solved.has(id) })),
      answer: this.step === "reveal" ? this.sound.answers[0] : null,
      actions: this.step === "listen" ? [{ action: "replay", label: "🔊 Spill av igjen", style: "secondary" }] : [],
      menu: [{ action: "next", label: this.step === "listen" ? "Avslør nå" : "Neste lyd nå" }]
    };
  }

  playerView(player) {
    return {
      type: "lyd",
      step: this.step,
      index: this.index,
      total: this.sounds.length,
      endsAt: this.step === "listen" ? this.autoAt : null,
      solved: this.solved ? this.solved.has(player.id) : false,
      points: this.solved ? this.solved.get(player.id) || null : null,
      cooldownUntil: this.cooldown ? this.cooldown.get(player.id) || null : null,
      answer: this.step === "reveal" ? this.sound.answers[0] : null
    };
  }
}

module.exports = SoundRound;

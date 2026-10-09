/*
  Minirunde – Bildezoom.
  Et bilde vises ekstremt zoomet inn på hovedskjermen og zoomer sakte ut (20 sekunder).
  Alle gjetter på mobilen, så mange ganger de vil. Riktig tidlig gir mest (500 → 100).
  Feil gjetning gir 5 sekunders pause. Svarene sjekkes automatisk (synonymer og små skrivefeil godtas).
  Bare et hake-ikon vises ved den som har gjettet riktig.

  Egne bilder: legg filene i assets/bilder/ og beskriv dem i assets/bilder/bilder.json (se README).
  Da brukes de i stedet for de innebygde emoji-bildene.
*/

const fs = require("fs");
const path = require("path");
const config = require("../config");
const { Round, GameError } = require("./base");
const { IMAGES } = require("../content-mini");
const { shuffle, pick, ms, randInt } = require("../util");
const text = require("../text");

const C = config.BILDE;

function loadImages() {
  const file = path.join(__dirname, "..", "..", C.FOLDER, "bilder.json");
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    const custom = list
      .filter(x => x && x.fil && Array.isArray(x.svar) && x.svar.length)
      .map(x => ({ src: `${C.FOLDER}/${x.fil}`, answers: x.svar.map(String) }));
    if (custom.length) return custom;
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Kunne ikke lese bilder.json:", err.message);
  }
  return IMAGES;
}

const BANK = loadImages();

class ZoomRound extends Round {
  start() {
    this.index = 0;
    this.nextImage();
  }

  nextImage() {
    if (this.index >= C.IMAGES) return this.finish();
    this.index++;
    let pool = BANK.filter(img => !this.game.usedContent.has(img));
    if (!pool.length) pool = BANK;
    this.image = pick(pool);
    this.game.usedContent.add(this.image);
    this.step = "zoom"; // zoom | reveal
    this.startedAt = this.game.now();
    this.zoomMs = ms(C.ZOOM_SECONDS);
    // Fokuspunkt: et tilfeldig sted nær midten, så første utsnitt ikke er helt tomt
    this.focus = { x: randInt(35, 65), y: randInt(35, 65) };
    this.solved = new Map(); // spiller -> poeng
    this.cooldown = new Map(); // spiller -> tidspunkt
    this.auto(() => this.reveal(), C.ZOOM_SECONDS + C.EXTRA_SECONDS);
    this.changed();
  }

  pointsNow() {
    const p = Math.min(1, (this.game.now() - this.startedAt) / this.zoomMs);
    return Math.round((C.MAX_POINTS - (C.MAX_POINTS - C.MIN_POINTS) * p) / 10) * 10;
  }

  guess(player, guessText) {
    if (this.step !== "zoom") throw new GameError("For sent.");
    if (this.solved.has(player.id)) return;
    const until = this.cooldown.get(player.id) || 0;
    if (this.game.now() < until) throw new GameError(`Vent ${Math.ceil((until - this.game.now()) / ms(1))} sekunder.`);
    const normalized = text.normalize(guessText);
    if (!normalized) throw new GameError("Skriv et svar.");
    const correct = this.image.answers.some(a => text.sameNormalized(text.normalize(a), normalized));
    if (correct) {
      const points = this.pointsNow();
      this.solved.set(player.id, points);
      this.game.award(player.id, points);
      if (this.allIn(this.solved)) this.auto(() => this.reveal(), 1);
    } else {
      this.cooldown.set(player.id, this.game.now() + ms(C.WRONG_COOLDOWN_SECONDS));
    }
    this.changed();
    return correct;
  }

  reveal() {
    if (this.step !== "zoom") return;
    this.step = "reveal";
    this.auto(() => this.nextImage(), C.REVEAL_SECONDS);
    this.changed();
  }

  playerAction(player, action, data) {
    if (action === "guess") return this.guess(player, data.text);
    return super.playerAction(player, action);
  }

  hostAction(action) {
    if (action === "next") return this.step === "zoom" ? this.reveal() : this.nextImage();
    return super.hostAction(action);
  }

  botAct(bot) {
    if (this.step !== "zoom" || this.solved.has(bot.id) || this.game.now() < (this.cooldown.get(bot.id) || 0)) return;
    if (this.chance(0.15)) this.guess(bot, this.chance(0.4) ? pick(this.image.answers) : "noe helt annet");
  }

  imageView() {
    return this.image.src ? { src: this.image.src } : { emoji: this.image.emoji };
  }

  hostView() {
    return {
      type: "bilde",
      step: this.step,
      index: this.index,
      total: C.IMAGES,
      image: this.imageView(),
      startedAt: this.startedAt,
      zoomMs: this.zoomMs,
      startZoom: C.START_ZOOM,
      focus: this.focus,
      endsAt: this.step === "zoom" ? this.autoAt : null,
      // Bare hake ved figuren til den som har gjettet riktig – aldri svaret
      players: this.activeParticipants().map(id => ({ ...this.publicPlayer(id), solved: this.solved.has(id) })),
      answer: this.step === "reveal" ? this.image.answers[0] : null,
      actions: [],
      menu: [{ action: "next", label: this.step === "zoom" ? "Avslør nå" : "Neste bilde nå" }]
    };
  }

  playerView(player) {
    return {
      type: "bilde",
      step: this.step,
      index: this.index,
      total: C.IMAGES,
      endsAt: this.step === "zoom" ? this.autoAt : null,
      solved: this.solved.has(player.id),
      points: this.solved.get(player.id) || null,
      cooldownUntil: this.cooldown.get(player.id) || null,
      answer: this.step === "reveal" ? this.image.answers[0] : null
    };
  }
}

module.exports = ZoomRound;

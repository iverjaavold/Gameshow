/*
  Minirunde – Nynn sangen.
  Samme oppsett som «Tegn ordet»: én spiller om gangen får en sangtittel og nynner den
  uten ord. De andre skriver hvilken sang det er. Først riktig får mest, og nynneren får
  poeng for hver som gjetter riktig. Rollen går på rundgang.
*/

const config = require("../config");
const GuessTurnRound = require("./mini-tegn");
const { SONGS } = require("../content-mini");
const { pick } = require("../util");

class HumRound extends GuessTurnRound {
  get C() {
    return config.NYNN;
  }

  get type() {
    return "nynn";
  }

  pickPrompt() {
    let pool = SONGS.filter(s => !this.game.usedContent.has(s));
    if (!pool.length) pool = SONGS;
    const song = pick(pool);
    this.game.usedContent.add(song);
    return { label: song.title, answers: song.answers };
  }
}

module.exports = HumRound;

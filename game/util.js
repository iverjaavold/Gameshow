const crypto = require("crypto");

// Alle tider i spillet går gjennom ms(), så tester kan kjøre spillet raskere
// (sett miljøvariabelen GAMESHOW_TIME_SCALE, f.eks. 0.02). Vanlig spill: 1.
const TIME_SCALE = Number(process.env.GAMESHOW_TIME_SCALE) || 1;

function ms(seconds) {
  return Math.round(seconds * 1000 * TIME_SCALE);
}

function randInt(min, max) {
  return min + crypto.randomInt(max - min + 1);
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pick(list) {
  return list[crypto.randomInt(list.length)];
}

function token() {
  return crypto.randomBytes(18).toString("base64url");
}

function rollDie() {
  return randInt(1, 6);
}

class GameError extends Error {}

module.exports = { TIME_SCALE, ms, randInt, randFloat, shuffle, pick, token, rollDie, GameError };

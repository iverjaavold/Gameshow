const crypto = require("crypto");

function randInt(min, max) {
  return min + crypto.randomInt(max - min + 1);
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

module.exports = { randInt, shuffle, pick, token, rollDie, GameError };

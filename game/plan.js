/*
  Setter opp rekkefølgen på de valgte spillene:
  - De store rundene i sin faste rekkefølge (de veksler allerede mellom samarbeid, konkurranse og strategi).
  - Minirundene spres jevnt mellom de store rundene, helst med en annen type enn spillet før.
  - Auksjonen settes inn jevnt fordelt, opptil MAX_AUCTIONS ganger (færre hvis det er få spill).
  - Finalen kommer alltid sist.
  Regner også ut når innloggingen og shopen stenger, og hvor betting og «Kjøp en medspiller» kommer.
*/

const config = require("./config");
const { GAMES, ALL_IDS } = require("./rounds");
const { shuffle, pick } = require("./util");

function buildPlan(selected) {
  const ids = ALL_IDS.filter(id => selected.includes(id));
  const big = ids.filter(id => GAMES[id].big && id !== "r10");
  let minis = shuffle(ids.filter(id => !GAMES[id].big && id !== "auksjon"));

  let seq = [];
  if (!big.length) {
    seq = minis;
  } else {
    // Hvor mange minirunder etter hver stor runde
    const counts = big.map(() => 0);
    minis.forEach((_, j) => counts[Math.floor(j * big.length / minis.length)]++);
    big.forEach((id, i) => {
      seq.push(id);
      for (let k = 0; k < counts[i]; k++) {
        const prevType = GAMES[seq[seq.length - 1]].type;
        const index = Math.max(0, minis.findIndex(m => GAMES[m].type !== prevType));
        seq.push(minis.splice(index, 1)[0]);
      }
    });
  }

  if (ids.includes("auksjon")) {
    const others = seq.length + (ids.includes("r10") ? 1 : 0);
    const count = Math.max(1, Math.min(config.MAX_AUCTIONS, Math.floor(others / config.GAMES_PER_AUCTION)));
    for (let k = count; k >= 1; k--) {
      seq.splice(Math.round(k * seq.length / (count + 1)), 0, "auksjon");
    }
  }

  if (ids.includes("r10")) seq.push("r10");
  return seq;
}

// Indeksen (0-basert) til spillet der innloggingen stenger / shopen stenger.
function thresholds(plan) {
  const n = plan.length;
  return {
    joinCloseIndex: Math.max(1, Math.ceil(n * config.JOIN_CLOSES_AT) - 1),
    shopCloseIndex: Math.max(1, Math.round(n * config.SHOP_CLOSES_AT))
  };
}

// Betting før ett tilfeldig spill som gir poeng (ikke det første, da har ingen poeng ennå).
function bettingIndex(plan) {
  const candidates = plan.map((id, i) => i).filter(i => i > 0 && config.ROUND_MAX_POINTS[plan[i]]);
  return candidates.length ? pick(candidates) : -1;
}

// «Kjøp en medspiller» før første valgte lagrunde som støtter det.
function buyTeammateIndex(plan) {
  for (const id of config.BUY_TEAMMATE_BEFORE) {
    const i = plan.indexOf(id);
    if (i >= 0) return i;
  }
  return -1;
}

function estimatedMinutes(selected) {
  const plan = buildPlan(selected);
  return plan.reduce((sum, id) => sum + GAMES[id].minutes, 0);
}

module.exports = { buildPlan, thresholds, bettingIndex, buyTeammateIndex, estimatedMinutes };

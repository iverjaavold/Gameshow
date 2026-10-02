/*
  Randomiser for par og lag.
  Husker hvem som har vært sammen før, og prøver mange tilfeldige oppsett
  for å velge det med færrest gjentatte sammenstillinger.
*/

const { shuffle } = require("./util");

const ATTEMPTS = 300;

class Randomizer {
  constructor() {
    this.history = new Map(); // "a|b" -> antall ganger sammen
  }

  key(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  cost(groups) {
    let cost = 0;
    groups.forEach(group => {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          cost += this.history.get(this.key(group[i], group[j])) || 0;
        }
      }
    });
    return cost;
  }

  remember(groups) {
    groups.forEach(group => {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const k = this.key(group[i], group[j]);
          this.history.set(k, (this.history.get(k) || 0) + 1);
        }
      }
    });
  }

  best(build) {
    let best = null;
    let bestCost = Infinity;
    for (let i = 0; i < ATTEMPTS && bestCost > 0; i++) {
      const groups = build();
      const c = this.cost(groups);
      if (c < bestCost) {
        best = groups;
        bestCost = c;
      }
    }
    this.remember(best);
    return best;
  }

  /*
    Par. Oddetall gir ett lag på 3.
    fixed: liste med grupper som allerede er bestemt (lederens makt).
  */
  pairs(ids, fixed = []) {
    const fixedIds = new Set(fixed.flat());
    const rest = ids.filter(id => !fixedIds.has(id));
    return this.best(() => {
      const order = shuffle(rest);
      const groups = fixed.map(g => g.slice());
      while (order.length >= 2) groups.push(order.splice(0, 2));
      if (order.length === 1) {
        if (groups.length) groups[groups.length - 1].push(order[0]);
        else groups.push([order[0]]);
      }
      return groups;
    });
  }

  // To lag med så lik størrelse som mulig.
  twoTeams(ids) {
    return this.best(() => {
      const order = shuffle(ids);
      const half = Math.ceil(order.length / 2);
      return [order.slice(0, half), order.slice(half)];
    });
  }

  /*
    Lag på 2–3. fixed: lag som allerede er satt (kjøpt medspiller).
    Faste lag med 2 kan få en tredje spiller hvis det går opp.
  */
  smallTeams(ids, fixed = []) {
    const fixedIds = new Set(fixed.flat());
    const rest = ids.filter(id => !fixedIds.has(id));
    return this.best(() => {
      const order = shuffle(rest);
      const groups = fixed.map(g => g.slice());
      const fresh = [];
      while (order.length >= 4 || order.length === 2) fresh.push(order.splice(0, 2));
      if (order.length === 3) fresh.push(order.splice(0, 3));
      if (order.length === 1) {
        const target = shuffle(groups.concat(fresh)).find(g => g.length < 3);
        if (target) target.push(order[0]);
        else if (groups.length + fresh.length) {
          // Alle lag er fulle: ta én fra et lag på 3 og lag et nytt par.
          const big = groups.concat(fresh).find(g => g.length === 3);
          fresh.push([big.pop(), order[0]]);
        } else {
          fresh.push([order[0]]);
        }
      }
      return groups.concat(fresh);
    });
  }
}

module.exports = Randomizer;

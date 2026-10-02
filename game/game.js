/*
  Spillmotor. All tilstand ligger her på serveren.
  Klientene får bare en «visning» bygget for akkurat dem (hostView / playerView).
*/

const config = require("./config");
const Randomizer = require("./randomizer");
const { pick, shuffle, token, GameError } = require("./util");
const { ROUNDS, ROUND_INFO, leaderPowerFor } = require("./rounds");


let nextId = 1;

class Game {
  constructor(code) {
    this.code = code;
    this.hostToken = token();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    this.players = new Map(); // id -> spiller
    this.phase = "lobby"; // lobby | betting | buyTeammate | leaderPower | intro | round | roundEnd | results
    this.roundNumber = 0;
    this.round = null;
    this.roundSummary = [];
    this.joinOpen = true;
    this.shopOpen = true;

    this.randomizer = new Randomizer();
    this.usedQuestions = new Set();
    this.usedWords = new Set();
    this.crownId = null; // kun runde 2

    this.feed = []; // meldinger på hovedskjermen
    this.listeners = new Set();
    this.roundTimers = new Set();
    this.broadcastQueued = false;

    // Betting
    this.bettingRound = pick(config.BETTING_ROUND_CANDIDATES);
    this.bets = new Map(); // playerId -> innsats
    this.bettingDone = false;

    // Kjøp en medspiller
    this.buy = null;
    this.buyDone = false;
    this.fixedTeams = [];

    // Lederens makt
    this.leaderPower = null; // { round, leaderId, def }
    this.leaderChoices = {}; // runde -> valg

    // Tyveri
    this.theft = null; // { thiefId, victimId, value, endsAt, timer }
  }

  // ---------- Spillere ----------

  get playerList() {
    return [...this.players.values()];
  }

  getPlayer(id) {
    return this.players.get(id);
  }

  playerByToken(t) {
    return this.playerList.find(p => p.token === t);
  }

  join(name, figure) {
    name = String(name || "").trim().slice(0, config.MAX_NAME_LENGTH);
    if (!name) throw new GameError("Skriv inn et navn.");

    const existing = this.playerList.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.connections > 0) throw new GameError("Navnet er allerede i bruk.");
      // Gjenoppkobling: samme kode + samme navn gir samme spiller.
      return existing;
    }
    if (!this.joinOpen) throw new GameError("Innloggingen er stengt.");

    let score = 0;
    if (this.phase !== "lobby" && this.players.size) {
      const lowest = Math.min(...this.playerList.map(p => p.score));
      score = Math.max(0, lowest - config.LATE_JOIN_PENALTY);
    }

    const player = {
      id: `p${nextId++}`,
      token: token(),
      name,
      figure: sanitizeFigure(figure),
      score,
      connections: 0,
      inventory: [],
      upgrades: { sword: 0, shield: 0, star: 0 },
      catchUp: 0,
      bonusBlocks: 0,
      roundBase: 0,
      toasts: []
    };
    this.players.set(player.id, player);
    if (this.phase !== "lobby") this.addFeed(`${name} ble med i spillet!`);
    this.changed();
    return player;
  }

  updateFigure(player, figure) {
    if (this.phase !== "lobby") throw new GameError("Figuren kan bare endres i lobbyen.");
    player.figure = sanitizeFigure(figure);
    this.changed();
  }

  kick(playerId) {
    if (this.phase !== "lobby") throw new GameError("Spillere kan bare fjernes i lobbyen.");
    this.players.delete(playerId);
    this.changed();
  }

  toast(player, text) {
    player.toasts.push({ id: nextId++, text });
    if (player.toasts.length > 6) player.toasts.shift();
  }

  addFeed(text) {
    this.feed.push({ id: nextId++, text, at: Date.now() });
    if (this.feed.length > 8) this.feed.shift();
  }

  leaders() {
    if (!this.players.size) return [];
    const top = Math.max(...this.playerList.map(p => p.score));
    return this.playerList.filter(p => p.score === top);
  }

  rankings() {
    return this.playerList.slice().sort((a, b) => b.score - a.score);
  }

  // ---------- Poeng ----------

  /*
    Poeng fra en runde. Catch-up og lynrunden dobler.
    opts.quiz: riktig quizsvar (lykkestjerne gir bonus).
  */
  award(playerId, base, opts = {}) {
    const player = this.getPlayer(playerId);
    if (!player || base <= 0) return 0;
    if (opts.quiz && player.upgrades.star) base += player.upgrades.star * config.UPGRADE_STAR_BONUS;
    player.roundBase += base;
    let points = base;
    if (player.catchUp > 0) points *= config.CATCHUP_MULTIPLIER;
    if (this.roundNumber === 9) points *= config.R9.MULTIPLIER;
    player.score += points;
    this.changed();
    return points;
  }

  // Direkte endring (betting, tyveri, kjøp). Aldri under 0.
  adjust(playerId, delta) {
    const player = this.getPlayer(playerId);
    if (!player) return 0;
    const before = player.score;
    player.score = Math.max(0, player.score + delta);
    this.changed();
    return player.score - before;
  }

  // Prøver å bruke en «positiv blokk» som ligger på spilleren. Returnerer true hvis bonusen ble blokkert.
  consumeBonusBlock(playerId, what) {
    const player = this.getPlayer(playerId);
    if (!player || player.bonusBlocks <= 0) return false;
    player.bonusBlocks--;
    this.toast(player, `Noen blokkerte ${what} din!`);
    return true;
  }

  // ---------- Rundeflyt ----------

  startGame() {
    if (this.phase !== "lobby") throw new GameError("Spillet er allerede i gang.");
    if (this.players.size < config.MIN_PLAYERS) throw new GameError(`Trenger minst ${config.MIN_PLAYERS} spillere.`);
    this.prepareRound(1);
  }

  // Går til første steg før runde n: betting, kjøp av medspiller eller intro.
  prepareRound(n) {
    this.roundNumber = n;
    this.round = null;
    this.roundSummary = [];
    this.crownId = null;
    if (n === this.bettingRound && !this.bettingDone) {
      this.phase = "betting";
      this.bets.clear();
    } else if (n === config.BUY_TEAMMATE_ROUND && !this.buyDone) {
      this.startBuyTeammate();
    } else {
      this.phase = "intro";
    }
    this.changed();
  }

  startRound() {
    if (this.phase !== "intro") throw new GameError("Runden kan ikke startes nå.");
    const n = this.roundNumber;
    if (n >= config.JOIN_CLOSES_AT_ROUND && this.joinOpen) {
      this.joinOpen = false;
      this.addFeed("Innloggingen er stengt.");
    }
    if (n >= config.SHOP_CLOSES_AT_ROUND && this.shopOpen) {
      this.shopOpen = false;
      this.addFeed("Shopen er stengt.");
    }
    this.playerList.forEach(p => { p.roundBase = 0; });
    const participants = this.playerList.map(p => p.id);
    const options = {
      leaderChoice: this.leaderChoices[n],
      fixedTeams: n === config.BUY_TEAMMATE_ROUND ? this.fixedTeams : []
    };
    const RoundClass = ROUNDS[n];
    this.round = new RoundClass(this, n, participants, options);
    this.phase = "round";
    this.round.start();
    this.changed();
  }

  // Kalles av rundemodulen når runden er ferdig.
  endRound() {
    if (this.phase !== "round") return;
    this.clearRoundTimers();
    const n = this.roundNumber;
    this.roundSummary = this.round.summary ? this.round.summary() : [];
    this.crownId = null;
    this.phase = "roundEnd";

    if (n === this.bettingRound && this.bets.size) this.settleBets(n);
    this.bettingDone = this.bettingDone || n >= this.bettingRound;

    if (n < 10) {
      this.payLeaderInterest();
      this.checkCatchUp();
    }
    this.changed();
  }

  forceEndRound() {
    if (this.phase !== "round") throw new GameError("Ingen runde å avslutte.");
    if (this.round.forceEnd) this.round.forceEnd();
    else this.endRound();
  }

  continueAfterRound() {
    if (this.phase !== "roundEnd") throw new GameError("Ikke tilgjengelig nå.");
    const n = this.roundNumber;
    if (n >= 10) {
      this.phase = "results";
      this.addFeed("Spillet er over!");
      this.changed();
      return;
    }
    const def = leaderPowerFor(this, n + 1);
    const leaders = this.leaders();
    // Står alle likt, finnes det ingen leder å gi makten til.
    if (def && leaders.length && leaders.length < this.players.size) {
      const leader = pick(leaders);
      const ms = config.LEADER_POWER_SECONDS * 1000;
      this.leaderPower = {
        round: n + 1,
        leaderId: leader.id,
        def,
        endsAt: Date.now() + ms,
        timer: setTimeout(() => {
          if (this.phase === "leaderPower") this.chooseLeaderPower(null, null);
        }, ms)
      };
      this.phase = "leaderPower";
      this.roundNumber = n + 1;
      this.toast(leader, "Du leder! Du får bestemme noe før neste runde.");
      this.changed();
      return;
    }
    this.prepareRound(n + 1);
  }

  chooseLeaderPower(player, value) {
    if (this.phase !== "leaderPower" || !this.leaderPower) throw new GameError("Ikke tilgjengelig nå.");
    if (player && player.id !== this.leaderPower.leaderId) throw new GameError("Bare lederen kan velge.");
    const def = this.leaderPower.def;
    if (value !== null && value !== undefined) {
      if (def.kind === "option") {
        if (!def.options.some(o => o.id === value)) throw new GameError("Ugyldig valg.");
      } else if (def.kind === "twoPlayers") {
        if (!Array.isArray(value) || value.length !== 2 || value[0] === value[1] || !value.every(id => this.players.has(id))) {
          throw new GameError("Velg to forskjellige spillere.");
        }
      }
      this.leaderChoices[this.leaderPower.round] = value;
      this.addFeed("Lederen har tatt et valg.");
    }
    const n = this.leaderPower.round;
    clearTimeout(this.leaderPower.timer);
    this.leaderPower = null;
    this.prepareRound(n);
  }

  payLeaderInterest() {
    const leaders = this.leaders();
    if (leaders.length === this.players.size) return; // alle står likt: ingen leder
    leaders.forEach(leader => {
      if (this.consumeBonusBlock(leader.id, "lederrenten")) return;
      leader.score += config.LEADER_INTEREST;
      this.toast(leader, `Lederrente: +${config.LEADER_INTEREST} poeng.`);
    });
  }

  checkCatchUp() {
    const players = this.playerList;
    players.forEach(p => {
      if (p.catchUp > 0) {
        p.catchUp--;
        if (p.catchUp === 0) this.toast(p, "Catch-up-bonusen er over.");
      }
    });
    const top = Math.max(...players.map(p => p.score));
    players.forEach(p => {
      if (p.catchUp === 0 && top - p.score > config.CATCHUP_GAP) {
        if (this.consumeBonusBlock(p.id, "catch-up-bonusen")) return;
        p.catchUp = config.CATCHUP_ROUNDS;
        this.toast(p, `Catch-up! Du får doble poeng de neste ${config.CATCHUP_ROUNDS} rundene.`);
      }
    });
  }

  // ---------- Betting ----------

  placeBet(player, amount) {
    if (this.phase !== "betting") throw new GameError("Betting er ikke åpen.");
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < 0) throw new GameError("Ugyldig innsats.");
    if (amount > player.score) throw new GameError("Du kan ikke satse mer enn du har.");
    this.bets.set(player.id, amount);
    this.changed();
  }

  closeBetting() {
    if (this.phase !== "betting") throw new GameError("Betting er ikke åpen.");
    this.bettingDone = true;
    this.addFeed("Innsatsene er låst!");
    if (this.roundNumber === config.BUY_TEAMMATE_ROUND && !this.buyDone) this.startBuyTeammate();
    else this.phase = "intro";
    this.changed();
  }

  settleBets(n) {
    const goal = config.ROUND_MAX_POINTS[n] * config.BETTING_GOOD_RATIO;
    this.bets.forEach((stake, playerId) => {
      const player = this.getPlayer(playerId);
      if (!player || !stake) return;
      if (player.roundBase > goal) {
        this.adjust(playerId, stake);
        this.toast(player, `Du gjorde det bra! Du vant innsatsen på ${stake}.`);
      } else {
        this.adjust(playerId, -stake);
        this.toast(player, `Du tapte innsatsen på ${stake}.`);
      }
    });
  }

  // ---------- Kjøp en medspiller ----------

  startBuyTeammate() {
    this.phase = "buyTeammate";
    this.buy = { step: "bidding", bids: new Map(), order: [], pickerIndex: 0, teams: [], endsAt: null, timer: null };
  }

  placeBid(player, amount) {
    if (this.phase !== "buyTeammate" || this.buy.step !== "bidding") throw new GameError("Budrunden er ikke åpen.");
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < 0) throw new GameError("Ugyldig bud.");
    if (amount > player.score) throw new GameError("Du kan ikke by mer enn du har.");
    this.buy.bids.set(player.id, amount);
    this.changed();
  }

  closeBids() {
    if (this.phase !== "buyTeammate" || this.buy.step !== "bidding") throw new GameError("Budrunden er ikke åpen.");
    const bidders = shuffle([...this.buy.bids.entries()].filter(([id, bid]) => bid > 0 && this.players.has(id)))
      .sort((a, b) => b[1] - a[1]);
    bidders.forEach(([id, bid]) => this.adjust(id, -bid));
    this.buy.order = bidders.map(([id]) => id);
    this.buy.step = "picking";
    this.buy.pickerIndex = -1;
    this.addFeed(bidders.length ? "Budene er inne!" : "Ingen bød. Randomiseren bestemmer.");
    this.nextPicker();
  }

  takenIds() {
    return new Set(this.buy.teams.flat());
  }

  nextPicker() {
    const buy = this.buy;
    if (buy.timer) clearTimeout(buy.timer);
    buy.timer = null;
    const taken = this.takenIds();
    const available = () => this.playerList.filter(p => !taken.has(p.id));
    do {
      buy.pickerIndex++;
    } while (buy.pickerIndex < buy.order.length && taken.has(buy.order[buy.pickerIndex]));

    if (buy.pickerIndex >= buy.order.length || available().length < 2) {
      this.finishBuyTeammate();
      return;
    }
    buy.endsAt = Date.now() + config.BUY_TEAMMATE_PICK_SECONDS * 1000;
    buy.timer = setTimeout(() => this.nextPicker(), config.BUY_TEAMMATE_PICK_SECONDS * 1000);
    this.changed();
  }

  pickTeammate(player, targetId) {
    const buy = this.buy;
    if (this.phase !== "buyTeammate" || buy.step !== "picking") throw new GameError("Ikke din tur.");
    if (buy.order[buy.pickerIndex] !== player.id) throw new GameError("Ikke din tur.");
    const taken = this.takenIds();
    if (targetId === player.id || taken.has(targetId) || !this.players.has(targetId)) throw new GameError("Den spilleren er ikke ledig.");
    buy.teams.push([player.id, targetId]);
    this.addFeed(`${player.name} valgte ${this.getPlayer(targetId).name}!`);
    this.nextPicker();
  }

  finishBuyTeammate() {
    if (this.buy.timer) clearTimeout(this.buy.timer);
    this.fixedTeams = this.buy.teams;
    this.buy.step = "done";
    this.buyDone = true;
    this.phase = "intro";
    this.changed();
  }

  // ---------- Shop og kort ----------

  buyItem(player, itemId) {
    if (!this.shopOpen) throw new GameError("Shopen er stengt.");
    if (this.phase === "results") throw new GameError("Spillet er over.");
    if (this.theft && this.theft.victimId === player.id) throw new GameError("Shopen er sperret mens noen stjeler fra deg!");
    const item = config.SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) throw new GameError("Ukjent vare.");
    if (player.score < item.price) throw new GameError("Du har ikke nok poeng.");
    if (item.kind === "upgrade" && player.upgrades[item.upgrade] >= item.max) throw new GameError("Du har allerede maks av denne.");

    player.score -= item.price;
    if (item.kind === "card") {
      player.inventory.push({ id: `c${nextId++}`, card: item.card, value: item.value || 0, name: item.name });
    } else {
      player.upgrades[item.upgrade]++;
    }
    this.toast(player, `Kjøpt: ${item.name}.`);
    this.addFeed("1 handling utført");
    this.changed();
  }

  useCard(player, cardId, targetId) {
    if (this.phase === "results") throw new GameError("Spillet er over.");
    const card = player.inventory.find(c => c.id === cardId);
    if (!card) throw new GameError("Du har ikke det kortet.");
    const target = this.getPlayer(targetId);

    if (card.card === "steal") {
      if (!target || target.id === player.id) throw new GameError("Velg en annen spiller.");
      if (this.theft) throw new GameError("Et annet tyveri pågår. Vent litt.");
      this.removeCard(player, cardId);
      const ms = config.THEFT_RESPONSE_SECONDS * 1000;
      this.theft = {
        thiefId: player.id,
        victimId: target.id,
        value: card.value,
        endsAt: Date.now() + ms,
        timer: setTimeout(() => this.resolveTheft("none"), ms)
      };
      this.addFeed("1 handling utført");
      this.changed();
      return;
    }

    if (card.card === "block") {
      if (!target || target.id === player.id) throw new GameError("Velg en annen spiller. (Blokk mot tyveri brukes i svarvinduet.)");
      this.removeCard(player, cardId);
      if (target.catchUp > 0) {
        target.catchUp = 0;
        this.toast(target, "Noen blokkerte catch-up-bonusen din!");
      } else {
        target.bonusBlocks++;
      }
      this.toast(player, `Blokk lagt på ${target.name}. Neste bonus hen får, blir stoppet.`);
      this.addFeed("1 handling utført");
      this.changed();
      return;
    }

    if (card.card === "uno") throw new GameError("Uno reverse brukes i svarvinduet når noen stjeler fra deg.");
    throw new GameError("Ukjent kort.");
  }

  removeCard(player, cardId) {
    player.inventory = player.inventory.filter(c => c.id !== cardId);
  }

  respondTheft(player, response) {
    const theft = this.theft;
    if (!theft || theft.victimId !== player.id) throw new GameError("Ingen tyveri å svare på.");
    if (response === "uno" || response === "block") {
      const card = player.inventory.find(c => c.card === response);
      if (!card) throw new GameError("Du har ikke det kortet.");
      this.removeCard(player, card.id);
    }
    this.resolveTheft(response);
  }

  resolveTheft(response) {
    const theft = this.theft;
    if (!theft) return;
    clearTimeout(theft.timer);
    this.theft = null;
    const thief = this.getPlayer(theft.thiefId);
    const victim = this.getPlayer(theft.victimId);
    if (!thief || !victim) return this.changed();

    if (response === "block") {
      this.toast(thief, `${victim.name} blokkerte tyveriet!`);
      this.toast(victim, "Du blokkerte tyveriet.");
    } else if (response === "uno") {
      const moved = -this.adjust(thief.id, -theft.value);
      this.adjust(victim.id, moved);
      this.toast(thief, `Uno reverse! ${victim.name} tok ${moved} poeng fra deg.`);
      this.toast(victim, `Uno reverse! Du tok ${moved} poeng fra ${thief.name}.`);
    } else {
      const moved = -this.adjust(victim.id, -theft.value);
      this.adjust(thief.id, moved);
      this.toast(thief, `Tyveriet lyktes! Du stjal ${moved} poeng fra ${victim.name}.`);
      this.toast(victim, `${thief.name} stjal ${moved} poeng fra deg.`);
    }
    this.changed();
  }

  // ---------- Timere ----------

  roundTimer(fn, ms) {
    const t = setTimeout(() => {
      this.roundTimers.delete(t);
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
      this.changed();
    }, ms);
    this.roundTimers.add(t);
    return t;
  }

  clearRoundTimer(t) {
    if (!t) return;
    clearTimeout(t);
    this.roundTimers.delete(t);
  }

  clearRoundTimers() {
    this.roundTimers.forEach(t => clearTimeout(t));
    this.roundTimers.clear();
  }

  destroy() {
    this.clearRoundTimers();
    if (this.theft) clearTimeout(this.theft.timer);
    if (this.buy && this.buy.timer) clearTimeout(this.buy.timer);
    if (this.leaderPower) clearTimeout(this.leaderPower.timer);
    this.listeners.forEach(l => l.res.end());
    this.listeners.clear();
  }

  // ---------- Handlinger fra klienter ----------

  hostAction(type, data) {
    switch (type) {
      case "startGame": return this.startGame();
      case "kick": return this.kick(data.playerId);
      case "startRound": return this.startRound();
      case "endRound": return this.forceEndRound();
      case "continue": return this.continueAfterRound();
      case "skipLeaderPower": return this.chooseLeaderPower(null, null);
      case "closeBetting": return this.closeBetting();
      case "closeBids": return this.closeBids();
      case "skipPicker": return this.nextPicker();
      case "round":
        if (this.phase !== "round") throw new GameError("Ingen runde pågår.");
        return this.round.hostAction(data.action, data);
      default: throw new GameError("Ukjent handling.");
    }
  }

  playerAction(player, type, data) {
    switch (type) {
      case "figure": return this.updateFigure(player, data.figure);
      case "buy": return this.buyItem(player, data.itemId);
      case "useCard": return this.useCard(player, data.cardId, data.targetId);
      case "respondTheft": return this.respondTheft(player, data.response);
      case "bet": return this.placeBet(player, data.amount);
      case "bid": return this.placeBid(player, data.amount);
      case "pickTeammate": return this.pickTeammate(player, data.targetId);
      case "leaderPower": return this.chooseLeaderPower(player, data.value);
      case "seenToasts":
        player.toasts = player.toasts.filter(t => t.id > Number(data.upTo));
        return;
      case "round":
        if (this.phase !== "round") throw new GameError("Ingen runde pågår.");
        if (!this.round.participants.includes(player.id)) throw new GameError("Du er med fra neste runde.");
        return this.round.playerAction(player, data.action, data);
      default: throw new GameError("Ukjent handling.");
    }
  }

  // ---------- Visninger ----------

  publicPlayer(p) {
    return { id: p.id, name: p.name, figure: p.figure, upgrades: p.upgrades, connected: p.connections > 0 };
  }

  roundInfo() {
    return this.roundNumber ? { number: this.roundNumber, ...ROUND_INFO[this.roundNumber] } : null;
  }

  hostView() {
    const players = this.playerList;
    const top = Math.max(1, ...players.map(p => p.score));
    const view = {
      role: "host",
      code: this.code,
      phase: this.phase,
      serverNow: Date.now(),
      round: this.roundInfo(),
      joinOpen: this.joinOpen,
      shopOpen: this.shopOpen,
      feed: this.feed,
      minPlayers: config.MIN_PLAYERS,
      players: players.map(p => ({
        ...this.publicPlayer(p),
        height: p.score / top, // bare relativ høyde, aldri tall
        crown: this.crownId === p.id
      })),
      theft: this.theft ? { endsAt: this.theft.endsAt } : null,
      summary: this.phase === "roundEnd" ? this.roundSummary : null
    };

    if (this.phase === "betting") {
      view.betting = { placed: this.bets.size, total: players.length };
    }
    if (this.phase === "buyTeammate") view.buy = this.buyView(null);
    if (this.phase === "leaderPower") view.leaderPower = { prompt: this.leaderPower.def.prompt, endsAt: this.leaderPower.endsAt };
    if (this.phase === "round") view.game = this.round.hostView();
    if (this.phase === "results") {
      view.results = this.rankings().map((p, i) => ({ place: i + 1, id: p.id, name: p.name }));
    }
    return view;
  }

  buyView(player) {
    const buy = this.buy;
    const pickerId = buy.step === "picking" ? buy.order[buy.pickerIndex] : null;
    const taken = this.takenIds();
    const view = {
      step: buy.step,
      bidsPlaced: buy.bids.size,
      total: this.players.size,
      pickerName: pickerId ? this.getPlayer(pickerId).name : null,
      endsAt: buy.endsAt,
      teams: buy.teams.map(t => t.map(id => this.getPlayer(id)?.name || "?"))
    };
    if (player) {
      view.myBid = buy.bids.get(player.id) ?? null;
      view.myTurn = pickerId === player.id;
      if (view.myTurn) {
        view.available = this.playerList.filter(p => !taken.has(p.id) && p.id !== player.id).map(p => ({ id: p.id, name: p.name }));
      }
    }
    return view;
  }

  playerView(player) {
    const view = {
      role: "player",
      code: this.code,
      phase: this.phase,
      serverNow: Date.now(),
      round: this.roundInfo(),
      me: {
        id: player.id,
        name: player.name,
        figure: player.figure,
        upgrades: player.upgrades,
        score: player.score,
        inventory: player.inventory,
        catchUp: player.catchUp
      },
      others: this.playerList.filter(p => p.id !== player.id).map(p => ({ id: p.id, name: p.name })),
      shop: {
        open: this.shopOpen && this.phase !== "results",
        locked: !!(this.theft && this.theft.victimId === player.id),
        items: config.SHOP_ITEMS
      },
      toasts: player.toasts
    };

    if (this.theft) {
      if (this.theft.victimId === player.id) {
        view.theftIncoming = {
          thiefName: this.getPlayer(this.theft.thiefId)?.name,
          value: this.theft.value,
          endsAt: this.theft.endsAt,
          hasUno: player.inventory.some(c => c.card === "uno"),
          hasBlock: player.inventory.some(c => c.card === "block")
        };
      }
      view.theftBusy = true;
    }

    if (this.phase === "betting") {
      view.betting = { myBet: this.bets.has(player.id) ? this.bets.get(player.id) : null, max: player.score };
    }
    if (this.phase === "buyTeammate") view.buy = this.buyView(player);
    if (this.phase === "leaderPower") {
      const lp = this.leaderPower;
      view.leaderPower = { isLeader: lp.leaderId === player.id, endsAt: lp.endsAt };
      if (view.leaderPower.isLeader) {
        view.leaderPower.prompt = lp.def.prompt;
        view.leaderPower.kind = lp.def.kind;
        view.leaderPower.options = lp.def.kind === "option"
          ? lp.def.options
          : this.playerList.map(p => ({ id: p.id, label: p.name }));
      }
    }
    if (this.phase === "round") {
      const inRound = this.round.participants.includes(player.id);
      view.inRound = inRound;
      view.game = inRound ? this.round.playerView(player) : null;
    }
    if (this.phase === "results") {
      const ranking = this.rankings();
      view.results = { place: ranking.indexOf(player) + 1, total: ranking.length, winner: ranking[0].name };
    }
    return view;
  }

  // ---------- Sanntid ----------

  addListener(listener) {
    this.listeners.add(listener);
    if (listener.playerId) {
      const p = this.getPlayer(listener.playerId);
      if (p) p.connections++;
    }
    this.changed();
  }

  removeListener(listener) {
    if (!this.listeners.delete(listener)) return;
    if (listener.playerId) {
      const p = this.getPlayer(listener.playerId);
      if (p) p.connections = Math.max(0, p.connections - 1);
    }
    this.changed();
  }

  changed() {
    this.lastActivity = Date.now();
    if (this.broadcastQueued) return;
    this.broadcastQueued = true;
    setImmediate(() => {
      this.broadcastQueued = false;
      this.broadcast();
    });
  }

  broadcast() {
    let hostJson = null;
    this.listeners.forEach(listener => {
      let json;
      try {
        if (listener.role === "host") {
          hostJson = hostJson || JSON.stringify(this.hostView());
          json = hostJson;
        } else {
          const player = this.getPlayer(listener.playerId);
          if (!player) {
            listener.res.write(`event: kicked\ndata: {}\n\n`);
            return;
          }
          json = JSON.stringify(this.playerView(player));
        }
        listener.res.write(`data: ${json}\n\n`);
      } catch (err) {
        console.error("Feil ved sending av tilstand:", err);
      }
    });
  }
}

// ---------- Figur ----------

const FIGURE_OPTIONS = {
  color: ["#ff5a5a", "#ff9f40", "#ffd84d", "#5ad16a", "#3fc6e0", "#5a7bff", "#b35aff", "#ff5aa5"],
  body: ["rund", "firkant", "trekant", "blob"],
  eyes: ["glad", "kul", "sint", "søvnig"],
  hat: ["ingen", "lue", "caps", "flosshatt", "sløyfe", "horn"]
};

function sanitizeFigure(figure) {
  figure = figure || {};
  const result = {};
  Object.entries(FIGURE_OPTIONS).forEach(([key, options]) => {
    result[key] = options.includes(figure[key]) ? figure[key] : options[0];
  });
  return result;
}

module.exports = { Game, GameError, FIGURE_OPTIONS };

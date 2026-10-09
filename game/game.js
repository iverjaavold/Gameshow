/*
  Spillmotor. All tilstand ligger her på serveren.
  Klientene får bare en «visning» bygget for akkurat dem (hostView / playerView).

  Spillet er en «plan»: en liste med valgte spill (store runder og minirunder) i rekkefølge.
  Appen går videre av seg selv mellom fasene. Hosten trykker bare «Start runde»
  (og grønn/rød der et menneske må vurdere et svar).
*/

const config = require("./config");
const Randomizer = require("./randomizer");
const { pick, shuffle, token, ms, randInt, GameError } = require("./util");
const { GAMES, ALL_IDS, leaderPowerFor, roundClass } = require("./rounds");
const plan = require("./plan");

let nextId = 1;

class Game {
  constructor(code) {
    this.code = code;
    this.hostToken = token();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    // Spillklokke: står stille mens spillet er på pause
    this.pausedAt = null;
    this.pausedTotal = 0;
    this.timers = new Set();

    this.players = new Map(); // id -> spiller
    this.phase = "lobby"; // lobby | betting | buyTeammate | leaderPower | intro | round | roundEnd | results
    this.round = null;
    this.roundSummary = [];
    this.joinOpen = true;
    this.shopOpen = true;

    // Valgte spill og rekkefølge
    this.selection = ALL_IDS.slice();
    this.plan = [];
    this.index = -1;
    this.limits = { joinCloseIndex: Infinity, shopCloseIndex: Infinity };

    this.randomizer = new Randomizer();
    this.usedQuestions = new Set();
    this.usedWords = new Set();
    this.usedContent = new Set(); // innhold brukt i minirunder
    this.crownId = null; // kun runde 2

    this.feed = []; // meldinger på hovedskjermen
    this.listeners = new Set();
    this.roundTimers = new Set();
    this.broadcastQueued = false;

    // Automatikk mellom fasene
    this.phaseTimer = null;
    this.phaseAutoAt = null;

    // Betting
    this.bettingIndex = -1;
    this.bets = new Map(); // playerId -> innsats
    this.bettingDone = false;

    // Kjøp en medspiller
    this.buyIndex = -1;
    this.buy = null;
    this.buyDone = false;
    this.fixedTeams = [];

    // Lederens makt
    this.leaderPower = null; // { index, leaderId, def, endsAt }
    this.leaderChoices = {}; // plan-indeks -> valg

    // Tyveri
    this.theft = null; // { thiefId, victimId, value, endsAt, timer }

    // Testmodus
    this.botTimer = null;
    this.botCount = 0;
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

  join(name, figure, opts = {}) {
    name = String(name || "").trim().slice(0, config.MAX_NAME_LENGTH);
    if (!name) throw new GameError("Skriv inn et navn.");

    const existing = this.playerList.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.connections > 0 || existing.bot) throw new GameError("Navnet er allerede i bruk.");
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
      bot: !!opts.bot,
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

  addBot() {
    this.botCount++;
    const figure = {};
    Object.entries(FIGURE_OPTIONS).forEach(([key, options]) => { figure[key] = pick(options); });
    const bot = this.join(`Bot ${this.botCount}`, figure, { bot: true });
    this.startBots();
    return bot;
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

  get currentId() {
    return this.plan[this.index];
  }

  isLast() {
    return this.index >= this.plan.length - 1;
  }

  // ---------- Poeng ----------

  /*
    Poeng fra et spill. Catch-up dobler.
    opts.quiz: riktig quizsvar (lykkestjerne gir bonus).
  */
  award(playerId, base, opts = {}) {
    const player = this.getPlayer(playerId);
    if (!player || base <= 0) return 0;
    if (opts.quiz && player.upgrades.star) base += player.upgrades.star * config.UPGRADE_STAR_BONUS;
    player.roundBase += base;
    let points = base;
    if (player.catchUp > 0) points *= config.CATCHUP_MULTIPLIER;
    player.score += points;
    this.changed();
    return points;
  }

  // Direkte endring (straff, betting, tyveri, kjøp). Aldri under 0.
  adjust(playerId, delta) {
    const player = this.getPlayer(playerId);
    if (!player) return 0;
    const before = player.score;
    player.score = Math.max(0, player.score + delta);
    if (delta < 0) player.roundBase += delta;
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

  // ---------- Spillklokke og pause ----------

  // Spilltid i ms. Står stille under pause, så alle nedtellinger og tidspunkter fryses.
  now() {
    return (this.pausedAt || Date.now()) - this.pausedTotal;
  }

  get paused() {
    return this.pausedAt !== null;
  }

  // Som setTimeout, men følger spillklokken (venter mens spillet er på pause).
  later(fn, delay) {
    const handle = { at: this.now() + delay, fn, t: null };
    this.timers.add(handle);
    this.armTimer(handle);
    return handle;
  }

  armTimer(handle) {
    if (this.paused) return;
    handle.t = setTimeout(() => {
      this.timers.delete(handle);
      handle.fn();
    }, Math.max(0, handle.at - this.now()));
  }

  cancel(handle) {
    if (!handle) return;
    clearTimeout(handle.t);
    this.timers.delete(handle);
  }

  pause() {
    if (this.paused) return;
    if (this.phase === "lobby" || this.phase === "results") throw new GameError("Ingenting å sette på pause nå.");
    this.pausedAt = Date.now();
    this.timers.forEach(handle => clearTimeout(handle.t));
    this.changed();
  }

  resume() {
    if (!this.paused) return;
    this.pausedTotal += Date.now() - this.pausedAt;
    this.pausedAt = null;
    this.timers.forEach(handle => this.armTimer(handle));
    this.changed();
  }

  // ---------- Automatikk mellom faser ----------

  setPhaseAuto(fn, seconds) {
    this.clearPhaseAuto();
    this.phaseAutoAt = this.now() + ms(seconds);
    this.phaseTimer = this.later(() => {
      this.phaseTimer = null;
      this.phaseAutoAt = null;
      try {
        fn();
      } catch (err) {
        if (!(err instanceof GameError)) console.error(err);
      }
      this.changed();
    }, ms(seconds));
  }

  clearPhaseAuto() {
    this.cancel(this.phaseTimer);
    this.phaseTimer = null;
    this.phaseAutoAt = null;
    this.phaseSoonPending = false;
  }

  // Når alle har svart: kort pause før appen går videre. Startes bare én gang.
  phaseSoon(fn) {
    if (this.phaseSoonPending) return;
    this.setPhaseAuto(fn, config.ALL_DONE_DELAY_SECONDS);
    this.phaseSoonPending = true;
  }

  // ---------- Valg av spill ----------

  setSelection(ids) {
    if (this.phase !== "lobby") throw new GameError("Spillene velges i lobbyen.");
    if (!Array.isArray(ids)) throw new GameError("Ugyldig valg.");
    this.selection = ALL_IDS.filter(id => ids.includes(id));
    this.changed();
  }

  /*
    Under spillet: velg hvilke spill som skal komme videre.
    Spill som er spilt eller pågår, blir stående. Resten settes opp på nytt (finalen fortsatt sist).
    Store runder som allerede er spilt, kan ikke velges igjen. Minirunder kan.
  */
  setUpcoming(ids) {
    if (this.phase === "lobby") return this.setSelection(ids);
    if (this.phase === "results") throw new GameError("Spillet er over.");
    if (!Array.isArray(ids)) throw new GameError("Ugyldig valg.");
    const done = this.plan.slice(0, this.index + 1);
    const chosen = ALL_IDS.filter(id => ids.includes(id) && !(GAMES[id].big && done.includes(id)));
    const rest = plan.buildPlan(chosen);
    this.plan = done.concat(rest);
    this.selection = chosen;

    // Regler som avhenger av planen, regnes ut på nytt for det som gjenstår.
    // (Innlogging og shop som allerede er stengt, åpnes ikke igjen.)
    this.limits = plan.thresholds(this.plan);
    // Betting og «Kjøp en medspiller» som ikke har skjedd ennå, flyttes til et passende gjenstående spill.
    // Pågår de akkurat nå (gjelder spillet som står for tur), blir de stående.
    const after = i => i > this.index;
    if (!this.bettingDone && this.bettingIndex !== this.index) {
      const candidates = this.plan.map((id, i) => i).filter(i => after(i) && config.ROUND_MAX_POINTS[this.plan[i]]);
      this.bettingIndex = candidates.length ? pick(candidates) : -1;
    }
    if (!this.buyDone && this.buyIndex !== this.index) {
      const buyAt = config.BUY_TEAMMATE_BEFORE.map(id => this.plan.findIndex((x, i) => after(i) && x === id)).find(i => i >= 0);
      this.buyIndex = buyAt === undefined ? -1 : buyAt;
    }
    // Lederens valg gjelder bare spillet de ble tatt for
    Object.keys(this.leaderChoices).forEach(i => {
      if (Number(i) > this.index) delete this.leaderChoices[i];
    });
    this.addFeed("Spillene videre er endret.");
    this.changed();
  }

  upcomingIds() {
    return [...new Set(this.plan.slice(this.index + 1))];
  }

  // ---------- Spillflyt ----------

  startGame() {
    if (this.phase !== "lobby") throw new GameError("Spillet er allerede i gang.");
    if (this.players.size < config.MIN_PLAYERS) throw new GameError(`Trenger minst ${config.MIN_PLAYERS} spillere.`);
    this.plan = plan.buildPlan(this.selection);
    if (!this.plan.length) throw new GameError("Velg minst ett spill.");
    this.limits = plan.thresholds(this.plan);
    this.bettingIndex = plan.bettingIndex(this.plan);
    this.buyIndex = plan.buyTeammateIndex(this.plan);
    this.prepareRound(0);
  }

  // Går til første steg før spill nr. i: betting, kjøp av medspiller eller intro.
  prepareRound(i) {
    this.clearPhaseAuto();
    this.index = i;
    this.round = null;
    this.roundSummary = [];
    this.crownId = null;
    if (i === this.bettingIndex && !this.bettingDone) {
      this.startBetting();
    } else if (i === this.buyIndex && !this.buyDone) {
      this.startBuyTeammate();
    } else {
      this.phase = "intro";
    }
    this.changed();
  }

  startRound() {
    if (this.phase !== "intro") throw new GameError("Runden kan ikke startes nå.");
    this.clearPhaseAuto();
    const i = this.index;
    if (i >= this.limits.joinCloseIndex && this.joinOpen) {
      this.joinOpen = false;
      this.addFeed("Innloggingen er stengt.");
    }
    if (i >= this.limits.shopCloseIndex && this.shopOpen) {
      this.shopOpen = false;
      this.addFeed("Shopen er stengt.");
    }
    this.playerList.forEach(p => { p.roundBase = 0; });
    const participants = this.playerList.map(p => p.id);
    const options = {
      leaderChoice: this.leaderChoices[i],
      fixedTeams: i === this.buyIndex ? this.fixedTeams : []
    };
    const RoundClass = roundClass(this.currentId);
    this.round = new RoundClass(this, this.currentId, participants, options);
    this.phase = "round";
    this.round.start();
    this.changed();
  }

  // Kalles av rundemodulen når spillet er ferdig.
  endRound() {
    if (this.phase !== "round") return;
    this.clearRoundTimers();
    this.roundSummary = this.round.summary ? this.round.summary() : [];
    this.crownId = null;
    this.phase = "roundEnd";

    if (this.index === this.bettingIndex && this.bets.size) this.settleBets(this.currentId);

    if (!this.isLast()) {
      this.payLeaderInterest();
      this.checkCatchUp();
    }
    this.setPhaseAuto(() => this.continueAfterRound(), config.ROUND_END_SECONDS);
    this.changed();
  }

  forceEndRound() {
    if (this.phase !== "round") throw new GameError("Ingen runde å avslutte.");
    if (this.round.forceEnd) this.round.forceEnd();
    else this.endRound();
  }

  continueAfterRound() {
    if (this.phase !== "roundEnd") throw new GameError("Ikke tilgjengelig nå.");
    this.clearPhaseAuto();
    if (this.isLast()) {
      this.phase = "results";
      this.addFeed("Spillet er over!");
      this.changed();
      return;
    }
    const next = this.index + 1;
    const def = leaderPowerFor(this.plan[next]);
    const leaders = this.leaders();
    // Står alle likt, finnes det ingen leder å gi makten til.
    if (def && leaders.length && leaders.length < this.players.size) {
      const leader = pick(leaders);
      this.leaderPower = { index: next, leaderId: leader.id, def, endsAt: this.now() + ms(config.LEADER_POWER_SECONDS) };
      this.phase = "leaderPower";
      this.index = next;
      this.toast(leader, "Du leder! Du får bestemme noe før neste runde.");
      this.setPhaseAuto(() => this.chooseLeaderPower(null, null), config.LEADER_POWER_SECONDS);
      this.changed();
      return;
    }
    this.prepareRound(next);
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
      this.leaderChoices[this.leaderPower.index] = value;
      this.addFeed("Lederen har tatt et valg.");
    }
    const i = this.leaderPower.index;
    this.leaderPower = null;
    this.prepareRound(i);
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

  // Teller alle spill, også minirunder.
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
        this.toast(p, `Catch-up! Du får doble poeng de neste ${config.CATCHUP_ROUNDS} spillene.`);
      }
    });
  }

  // ---------- Betting ----------

  startBetting() {
    this.phase = "betting";
    this.bets.clear();
    this.setPhaseAuto(() => this.closeBetting(), config.BETTING_SECONDS);
  }

  placeBet(player, amount) {
    if (this.phase !== "betting") throw new GameError("Betting er ikke åpen.");
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < 0) throw new GameError("Ugyldig innsats.");
    if (amount > player.score) throw new GameError("Du kan ikke satse mer enn du har.");
    this.bets.set(player.id, amount);
    if (this.playerList.every(p => this.bets.has(p.id))) {
      this.phaseSoon(() => this.closeBetting());
    }
    this.changed();
  }

  closeBetting() {
    if (this.phase !== "betting") throw new GameError("Betting er ikke åpen.");
    this.clearPhaseAuto();
    this.bettingDone = true;
    this.addFeed("Innsatsene er låst!");
    if (this.index === this.buyIndex && !this.buyDone) this.startBuyTeammate();
    else this.phase = "intro";
    this.changed();
  }

  settleBets(id) {
    const goal = config.ROUND_MAX_POINTS[id] * config.BETTING_GOOD_RATIO;
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
    this.setPhaseAuto(() => this.closeBids(), config.BID_SECONDS);
  }

  placeBid(player, amount) {
    if (this.phase !== "buyTeammate" || this.buy.step !== "bidding") throw new GameError("Budrunden er ikke åpen.");
    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < 0) throw new GameError("Ugyldig bud.");
    if (amount > player.score) throw new GameError("Du kan ikke by mer enn du har.");
    this.buy.bids.set(player.id, amount);
    if (this.playerList.every(p => this.buy.bids.has(p.id))) {
      this.phaseSoon(() => this.closeBids());
    }
    this.changed();
  }

  closeBids() {
    if (this.phase !== "buyTeammate" || this.buy.step !== "bidding") throw new GameError("Budrunden er ikke åpen.");
    this.clearPhaseAuto();
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
    this.cancel(buy.timer);
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
    buy.endsAt = this.now() + ms(config.BUY_TEAMMATE_PICK_SECONDS);
    buy.timer = this.later(() => this.nextPicker(), ms(config.BUY_TEAMMATE_PICK_SECONDS));
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
    this.cancel(this.buy.timer);
    this.clearPhaseAuto();
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
    this.giveItem(player, item);
    this.toast(player, `Kjøpt: ${item.name}.`);
    this.addFeed("1 handling utført");
    this.changed();
  }

  // Legger et kort eller en oppgradering i beholdningen (shop og auksjon)
  giveItem(player, item) {
    if (item.kind === "card") {
      player.inventory.push({ id: `c${nextId++}`, card: item.card, value: item.value || 0, name: item.name });
    } else {
      player.upgrades[item.upgrade]++;
    }
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
      this.theft = {
        thiefId: player.id,
        victimId: target.id,
        value: card.value,
        endsAt: this.now() + ms(config.THEFT_RESPONSE_SECONDS),
        timer: this.later(() => this.resolveTheft("timeout"), ms(config.THEFT_RESPONSE_SECONDS))
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
    this.cancel(theft.timer);
    this.theft = null;
    const thief = this.getPlayer(theft.thiefId);
    const victim = this.getPlayer(theft.victimId);
    if (!thief || !victim) return this.changed();

    if (response === "block") {
      this.toast(thief, `${victim.name} blokkerte tyveriet!`);
      this.toast(victim, "Du blokkerte tyveriet.");
    } else if (response === "timeout") {
      // Offeret ventet ut tiden: ingen poeng flyttes, offeret mistet bare tiden (shopen var sperret).
      this.toast(thief, `${victim.name} ventet ut tiden. Tyveriet ga ingen poeng.`);
      this.toast(victim, "Du ventet ut tiden og beholdt poengene dine.");
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

  // ---------- Testmodus: bots ----------

  startBots() {
    if (this.botTimer) return;
    this.botTimer = setInterval(() => this.botTick(), Math.max(20, ms(config.BOT_TICK_SECONDS)));
  }

  botTick() {
    if (this.paused) return;
    const bots = this.playerList.filter(p => p.bot);
    if (!bots.length) return;
    const tryDo = fn => {
      try {
        fn();
      } catch (err) {
        if (!(err instanceof GameError)) console.error("Bot-feil:", err);
      }
    };
    bots.forEach(bot => {
      const r = Math.random();
      if (this.theft && this.theft.victimId === bot.id && r < 0.4) {
        const options = ["accept"].concat(bot.inventory.filter(c => c.card !== "steal").map(c => c.card));
        tryDo(() => this.respondTheft(bot, pick(options)));
      }
      if (this.phase === "betting" && !this.bets.has(bot.id) && r < 0.3) {
        tryDo(() => this.placeBet(bot, randInt(0, Math.floor(bot.score * 0.3))));
      }
      if (this.phase === "buyTeammate") {
        if (this.buy.step === "bidding" && !this.buy.bids.has(bot.id) && r < 0.3) {
          tryDo(() => this.placeBid(bot, randInt(0, Math.min(bot.score, 300))));
        }
        if (this.buy.step === "picking" && this.buy.order[this.buy.pickerIndex] === bot.id && r < 0.5) {
          const taken = this.takenIds();
          const free = this.playerList.filter(p => !taken.has(p.id) && p.id !== bot.id);
          if (free.length) tryDo(() => this.pickTeammate(bot, pick(free).id));
        }
      }
      if (this.phase === "leaderPower" && this.leaderPower.leaderId === bot.id && r < 0.3) {
        const def = this.leaderPower.def;
        const value = def.kind === "option" ? pick(def.options).id : shuffle(this.playerList).slice(0, 2).map(p => p.id);
        tryDo(() => this.chooseLeaderPower(bot, value));
      }
      // Litt shopping og kortbruk innimellom
      if (this.shopOpen && this.phase !== "results" && r > 0.995) {
        const affordable = config.SHOP_ITEMS.filter(i => i.price <= bot.score);
        if (affordable.length) tryDo(() => this.buyItem(bot, pick(affordable).id));
      }
      if (this.phase !== "results" && r < 0.003 && bot.inventory.length) {
        const card = pick(bot.inventory.filter(c => c.card !== "uno").concat([null]));
        const target = pick(this.playerList.filter(p => p.id !== bot.id));
        if (card && target) tryDo(() => this.useCard(bot, card.id, target.id));
      }
      if (this.phase === "round" && this.round.participants.includes(bot.id) && !this.round.ended) {
        tryDo(() => this.round.botAct(bot));
      }
    });
  }

  // ---------- Timere ----------

  roundTimer(fn, delay) {
    const t = this.later(() => {
      this.roundTimers.delete(t);
      try {
        fn();
      } catch (err) {
        if (!(err instanceof GameError)) console.error(err);
      }
      this.changed();
    }, delay);
    this.roundTimers.add(t);
    return t;
  }

  clearRoundTimer(t) {
    if (!t) return;
    this.cancel(t);
    this.roundTimers.delete(t);
  }

  clearRoundTimers() {
    this.roundTimers.forEach(t => this.cancel(t));
    this.roundTimers.clear();
  }

  destroy() {
    this.clearRoundTimers();
    this.clearPhaseAuto();
    if (this.botTimer) clearInterval(this.botTimer);
    this.timers.forEach(handle => clearTimeout(handle.t));
    this.timers.clear();
    this.listeners.forEach(l => l.res.end());
    this.listeners.clear();
  }

  // ---------- Handlinger fra klienter ----------

  hostAction(type, data) {
    switch (type) {
      case "setSelection": return this.setSelection(data.ids);
      case "setUpcoming": return this.setUpcoming(data.ids);
      case "addBot": return this.addBot();
      case "pause": return this.pause();
      case "resume": return this.resume();
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
    if (this.paused && type !== "seenToasts" && type !== "figure") throw new GameError("Spillet er satt på pause.");
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
    return { id: p.id, name: p.name, figure: p.figure, upgrades: p.upgrades, connected: p.bot || p.connections > 0, bot: p.bot };
  }

  roundInfo() {
    const id = this.currentId;
    if (!id) return null;
    const g = GAMES[id];
    return { number: this.index + 1, total: this.plan.length, id, title: g.title, tag: g.tag, rules: g.rules, mini: !g.big };
  }

  hostView() {
    const players = this.playerList;
    const top = Math.max(1, ...players.map(p => p.score));
    const view = {
      role: "host",
      code: this.code,
      phase: this.phase,
      serverNow: this.now(),
      paused: this.paused,
      round: this.roundInfo(),
      joinOpen: this.joinOpen,
      shopOpen: this.shopOpen,
      feed: this.feed,
      minPlayers: config.MIN_PLAYERS,
      autoAt: this.phaseAutoAt,
      players: players.map(p => ({
        ...this.publicPlayer(p),
        height: p.score / top, // bare relativ høyde, aldri tall
        crown: this.crownId === p.id
      })),
      plan: this.plan.map(id => ({ id, title: GAMES[id].title, mini: !GAMES[id].big })),
      summary: this.phase === "roundEnd" ? this.roundSummary : null
    };

    if (this.phase !== "results") {
      view.games = ALL_IDS.map(id => {
        const g = GAMES[id];
        return { id, title: g.title, desc: g.desc, minutes: g.minutes, big: !!g.big, type: g.type, recommended: g.recommended || null };
      });
    }
    if (this.phase === "lobby") {
      view.selection = this.selection;
      view.estimatedMinutes = plan.estimatedMinutes(this.selection);
    } else if (this.phase !== "results") {
      // Til menyen «Velg spill videre»
      const upcoming = this.upcomingIds();
      const played = this.plan.slice(0, this.index + 1);
      view.upcoming = {
        selected: upcoming,
        locked: ALL_IDS.filter(id => GAMES[id].big && played.includes(id)), // store runder som er spilt / pågår
        remainingMinutes: this.plan.slice(this.index + 1).reduce((sum, id) => sum + GAMES[id].minutes, 0)
      };
    }
    if (this.phase === "betting") view.betting = { placed: this.bets.size, total: players.length };
    if (this.phase === "buyTeammate") view.buy = this.buyView(null);
    if (this.phase === "leaderPower") view.leaderPower = { prompt: this.leaderPower.def.prompt, endsAt: this.leaderPower.endsAt };
    if (this.phase === "round") {
      // Runden kan selv sette autoAt: null for å skjule nedtellingen (f.eks. «Gjett 30 sekunder»).
      view.game = { autoAt: this.round.autoAt, ...this.round.hostView() };
    }
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
      endsAt: buy.step === "picking" ? buy.endsAt : this.phaseAutoAt,
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
      serverNow: this.now(),
      paused: this.paused,
      round: this.roundInfo(),
      autoAt: this.phaseAutoAt,
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

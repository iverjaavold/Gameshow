/*
  Runde 1 – Hvelvet (inspirert av Sky Team).
  Parene spiller etter hverandre. Hver spiller kaster 4 terninger som bare vises på egen mobil.
  Paret bytter på å legge én terning: Balanse, Kode, Lås eller Fokus (polett for ±1).
  Et lag på 3 deles opp i to par, der én spiller går to ganger (uten poeng andre gang).
*/

const config = require("../config");
const { Round, GameError } = require("./base");
const { rollDie } = require("../util");

const C = config.R1;

let dieId = 1;

class VaultRound extends Round {
  start() {
    const groups = this.game.randomizer.pairs(this.participants);
    this.runs = [];
    groups.forEach(g => {
      if (g.length === 3) {
        this.runs.push({ members: [g[0], g[1]], noPoints: [] });
        this.runs.push({ members: [g[2], g[0]], noPoints: [g[0]] });
      } else if (g.length === 2) {
        this.runs.push({ members: g, noPoints: [] });
      }
    });
    this.results = [];
    this.runIndex = -1;
    this.nextRun();
  }

  get run() {
    return this.runs[this.runIndex];
  }

  nextRun() {
    this.runIndex++;
    if (this.runIndex >= this.runs.length) return this.finish();
    Object.assign(this.run, { level: 0, alarm: 0, cleared: 0, tokens: 0 });
    this.prepareLevel();
  }

  prepareLevel() {
    const run = this.run;
    run.step = "talk"; // talk | place | levelResult | runDone
    run.dice = {};
    run.members.forEach(id => { run.dice[id] = []; });
    run.slots = { balance: {}, code: {}, lock: null };
    run.turn = run.level % 2;
    run.event = null;
    this.changed();
  }

  roll() {
    const run = this.run;
    if (run.step !== "talk") throw new GameError("Terningene er allerede kastet.");
    run.members.forEach(id => {
      run.dice[id] = Array.from({ length: C.DICE_PER_PLAYER }, () => ({ id: dieId++, v: rollDie() }));
    });
    run.step = "place";
    run.event = "Terningene er kastet. Nå er det FORBUDT å snakke!";
    this.changed();
  }

  currentPlayerId() {
    return this.run.members[this.run.turn];
  }

  place(player, data) {
    const run = this.run;
    if (run.step !== "place") throw new GameError("Ikke tid for å legge terninger.");
    if (this.currentPlayerId() !== player.id) throw new GameError("Det er ikke din tur.");
    const dice = run.dice[player.id];
    const die = dice.find(d => d.id === Number(data.dieId));
    if (!die) throw new GameError("Velg en av terningene dine.");

    const adjust = Number(data.adjust) || 0;
    if (![-1, 0, 1].includes(adjust)) throw new GameError("Ugyldig justering.");
    if (adjust && run.tokens < 1) throw new GameError("Dere har ingen fokus-poletter.");
    const value = die.v + adjust;
    if (value < 1 || value > 6) throw new GameError("Terningen må være mellom 1 og 6.");

    const slot = data.slot;
    if (slot === "balance" || slot === "code") {
      if (run.slots[slot][player.id] !== undefined) throw new GameError("Du har allerede lagt en terning der.");
      run.slots[slot][player.id] = value;
    } else if (slot === "lock") {
      if (run.slots.lock !== null) throw new GameError("Låsen er allerede fylt.");
      run.slots.lock = value;
    } else if (slot === "focus") {
      if (adjust) throw new GameError("Fokus kan ikke justeres.");
      run.tokens++;
    } else {
      throw new GameError("Ukjent felt.");
    }
    if (adjust) run.tokens--;
    run.dice[player.id] = dice.filter(d => d !== die);

    const labels = { balance: "Balanse", code: "Kode", lock: "Lås", focus: "Fokus" };
    run.event = `${player.name} la ${slot === "focus" ? "en terning" : value} på ${labels[slot]}.`;

    if (this.allSlotsFilled()) return this.resolveLevel();
    this.advanceTurn();
    this.changed();
  }

  allSlotsFilled() {
    const s = this.run.slots;
    return this.run.members.every(id => s.balance[id] !== undefined && s.code[id] !== undefined) && s.lock !== null;
  }

  advanceTurn() {
    const run = this.run;
    const other = 1 - run.turn;
    if (run.dice[run.members[other]].length) run.turn = other;
    else if (!run.dice[run.members[run.turn]].length) this.resolveLevel();
  }

  resolveLevel() {
    const run = this.run;
    const s = run.slots;
    const [a, b] = run.members;
    const target = C.CODE_TARGETS[run.level];
    const lockValue = C.LOCK_VALUES[run.level];
    const notes = [];
    let alarms = 0;

    const balanceFilled = s.balance[a] !== undefined && s.balance[b] !== undefined;
    if (!balanceFilled) {
      alarms++;
      notes.push("Balansen ble ikke fylt.");
    } else if (Math.abs(s.balance[a] - s.balance[b]) > C.BALANCE_MAX_DIFF) {
      alarms++;
      notes.push(`Balansen var ute av likevekt (${s.balance[a]} og ${s.balance[b]}).`);
    }

    const codeOk = s.code[a] !== undefined && s.code[b] !== undefined && s.code[a] + s.code[b] === target;
    if (!codeOk) {
      alarms++;
      notes.push(`Koden traff ikke ${target}.`);
    }

    const lockOk = s.lock === lockValue;
    if (!lockOk) {
      alarms++;
      notes.push(`Låsen krevde ${lockValue}.`);
    }

    run.alarm = Math.min(C.ALARM_MAX, run.alarm + alarms);
    const cleared = balanceFilled && codeOk && lockOk;

    if (cleared) {
      run.cleared++;
      run.level++;
      notes.unshift(`Nivå ${run.level} er knekt!`);
    } else {
      notes.unshift(`Nivå ${run.level + 1} ble ikke knekt.`);
    }

    run.event = notes.join(" ");
    if (run.alarm >= C.ALARM_MAX || run.level >= C.LEVELS) return this.endRun();
    run.step = "levelResult";
    this.scheduleContinue(C.AUTO_NEXT_SECONDS);
    this.changed();
  }

  // Går videre av seg selv, så runden aldri står fast og venter på en knapp.
  scheduleContinue(seconds) {
    this.clearTimer(this.autoTimer);
    this.autoAt = Date.now() + seconds * 1000;
    this.autoTimer = this.timer(() => this.continueRun(), seconds * 1000);
  }

  endRun() {
    const run = this.run;
    run.step = "runDone";
    const points = run.cleared * C.POINTS_PER_LEVEL;
    run.members.forEach(id => {
      if (!run.noPoints.includes(id)) this.game.award(id, points);
    });
    const how = run.level >= C.LEVELS ? "knakk hele hvelvet!" : `klarte ${run.cleared} av ${C.LEVELS} nivåer.`;
    run.event = (run.alarm >= C.ALARM_MAX ? "ALARM! " : "") + `${this.names(run.members).join(" og ")} ${how}`;
    this.results.push({ names: this.names(run.members), cleared: run.cleared });
    this.lines.push(run.event);
    this.scheduleContinue(C.AUTO_NEXT_PAIR_SECONDS);
    this.changed();
  }

  continueRun() {
    const run = this.run;
    this.clearTimer(this.autoTimer);
    this.autoAt = null;
    if (run.step === "levelResult") return this.prepareLevel();
    if (run.step === "runDone") return this.nextRun();
    throw new GameError("Ikke tilgjengelig nå.");
  }

  hostAction(action) {
    if (action === "roll") return this.roll();
    if (action === "continue") return this.continueRun();
    if (action === "skipTurn") {
      // Hvis en spiller mangler: hopp over turen.
      if (this.run.step !== "place") return;
      const run = this.run;
      run.dice[this.currentPlayerId()] = [];
      this.advanceTurn();
      return this.changed();
    }
    if (action === "endRun") {
      if (this.run.step === "runDone") return this.continueRun();
      return this.endRun();
    }
    return super.hostAction(action);
  }

  playerAction(player, action, data) {
    const run = this.run;
    const member = run && run.members.includes(player.id);
    if (!member) throw new GameError("Det er ikke ditt pars tur.");
    if (action === "roll") return this.roll();
    if (action === "place") return this.place(player, data);
    if (action === "continue") return this.continueRun();
    return super.playerAction(player, action);
  }

  autoAtFor(run) {
    return run.step === "levelResult" || run.step === "runDone" ? this.autoAt : null;
  }

  slotView() {
    const run = this.run;
    const s = run.slots;
    return {
      balance: run.members.map(id => (s.balance[id] === undefined ? null : s.balance[id])),
      code: run.members.map(id => (s.code[id] === undefined ? null : s.code[id])),
      lock: s.lock,
      codeTarget: C.CODE_TARGETS[Math.min(run.level, C.LEVELS - 1)],
      lockValue: C.LOCK_VALUES[Math.min(run.level, C.LEVELS - 1)],
      balanceMaxDiff: C.BALANCE_MAX_DIFF
    };
  }

  hostView() {
    const run = this.run;
    if (!run) return { type: "vault" };
    const actions = [];
    if (run.step === "talk") actions.push({ action: "roll", label: "Kast terningene" });
    if (run.step === "levelResult") actions.push({ action: "continue", label: "Neste forsøk" });
    if (run.step === "runDone") actions.push({ action: "continue", label: this.runIndex + 1 >= this.runs.length ? "Avslutt runden" : "Neste par" });
    if (run.step === "place") actions.push({ action: "skipTurn", label: "Hopp over tur" });
    if (run.step !== "runDone") actions.push({ action: "endRun", label: "Avslutt for paret" });
    return {
      type: "vault",
      runIndex: this.runIndex,
      runCount: this.runs.length,
      members: run.members.map(id => this.publicPlayer(id)),
      level: run.level,
      levels: C.LEVELS,
      alarm: run.alarm,
      alarmMax: C.ALARM_MAX,
      tokens: run.tokens,
      step: run.step,
      turnName: run.step === "place" ? this.name(this.currentPlayerId()) : null,
      diceLeft: run.members.map(id => (run.dice[id] || []).length),
      slots: this.slotView(),
      event: run.event,
      autoAt: this.autoAtFor(run),
      results: this.results,
      upcoming: this.runs.slice(this.runIndex + 1).map(r => this.names(r.members)),
      actions
    };
  }

  playerView(player) {
    const run = this.run;
    if (!run) return { type: "vault", waiting: true };
    const index = run.members.indexOf(player.id);
    if (index < 0) {
      const upcoming = this.runs.slice(this.runIndex + 1).some(r => r.members.includes(player.id));
      return { type: "vault", waiting: true, upcoming, currentNames: this.names(run.members) };
    }
    return {
      type: "vault",
      waiting: false,
      myIndex: index,
      partnerName: this.name(run.members[1 - index]),
      level: run.level,
      levels: C.LEVELS,
      alarm: run.alarm,
      alarmMax: C.ALARM_MAX,
      tokens: run.tokens,
      step: run.step,
      myTurn: run.step === "place" && this.currentPlayerId() === player.id,
      dice: run.dice[player.id] || [],
      slots: this.slotView(),
      event: run.event,
      autoAt: this.autoAtFor(run)
    };
  }
}

module.exports = VaultRound;

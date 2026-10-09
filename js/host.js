/*
  Hovedskjermen. Viser poengtavle (søyler uten tall), rundeinfo og avsløringer.
  Hosten skal gjøre minst mulig: bare «Start runde» og grønn/rød der et menneske må vurdere.
  Alt annet går av seg selv. Manuelle overstyringer ligger bak «⋯».
*/

(function() {
  const { esc, attr, api, connect, countdown, render, figureSvg, gridHtml, store, lightsHtml, mineHtml } = GS;
  const params = new URLSearchParams(location.search);
  const code = (params.get("kode") || "").toUpperCase();
  const token = store(`gs-host-${code}`);
  const SETUPS_KEY = "gs-oppsett";

  const els = {
    code: document.getElementById("code"),
    shareButton: document.getElementById("share-button"),
    roundLabel: document.getElementById("round-label"),
    connection: document.getElementById("connection"),
    feed: document.getElementById("feed"),
    stage: document.getElementById("stage"),
    board: document.getElementById("board"),
    controls: document.getElementById("controls"),
    planner: document.getElementById("planner")
  };

  if (!code || !token) {
    els.stage.innerHTML = `<div class="panel center"><h2>Fant ikke spillet</h2><p><a href="./" style="color:var(--yellow)">Tilbake til forsiden</a></p></div>`;
    return;
  }

  els.code.textContent = code;
  const joinQr = qrSvg(GS.joinUrl(code));
  els.shareButton.addEventListener("click", () => GS.shareGame(code, els.shareButton));
  document.getElementById("feedback-button").addEventListener("click", () => GS.openFeedback(`hovedskjerm ${code}`));
  let view = null;
  let seenFeed = 0;
  let showMenu = false;
  let showPlanner = false;

  GS.startCountdowns();
  connect(code, token, v => {
    view = v;
    draw();
  }, status => {
    els.connection.classList.toggle("off", status !== true);
    if (status === "gone") els.stage.innerHTML = `<div class="panel center"><h2>Spillet finnes ikke lenger</h2></div>`;
  });

  async function send(type, data) {
    try {
      await api("/api/action", { code, token, type, data });
    } catch (e) {
      flash(e.message);
    }
  }

  function flash(text) {
    const item = document.createElement("div");
    item.className = "item";
    item.style.background = "var(--bad)";
    item.textContent = text;
    els.feed.appendChild(item);
    setTimeout(() => item.remove(), 6000);
  }

  // ---------- Klikk ----------

  document.addEventListener("click", e => {
    const shareBtn = e.target.closest("[data-share]");
    if (shareBtn) return GS.shareGame(code, shareBtn);
    const btn = e.target.closest("[data-send]");
    if (btn) {
      const { type, data } = JSON.parse(btn.dataset.send);
      if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
      if (btn.closest("#controls .menu")) showMenu = false;
      send(type, data || {});
      return;
    }
    if (e.target.closest("[data-menu]")) {
      showMenu = !showMenu;
      drawControls();
      return;
    }
    if (e.target.closest("[data-planner]")) {
      showPlanner = !showPlanner;
      drawPlanner();
      return;
    }
    const sel = e.target.closest("[data-select]");
    if (sel) {
      // I lobbyen: hele utvalget. Under spillet: spillene videre (spilte store runder kan ikke velges).
      const inGame = view.phase !== "lobby";
      const all = view.games.map(g => g.id).filter(id => !inGame || !view.upcoming.locked.includes(id));
      send(inGame ? "setUpcoming" : "setSelection", { ids: sel.dataset.select === "all" ? all : [] });
      return;
    }
    if (e.target.closest("[data-save-setup]")) {
      const name = prompt("Navn på oppsettet:", "Mitt oppsett");
      if (!name) return;
      const setups = store(SETUPS_KEY) || {};
      setups[name] = view.phase === "lobby" ? view.selection : view.upcoming.selected;
      store(SETUPS_KEY, setups);
      drawStage();
      drawPlanner();
      flashInfo(`Oppsettet «${name}» er lagret.`);
    }
  });

  document.addEventListener("change", e => {
    const box = e.target.closest("[data-pick]");
    if (box) {
      const id = box.dataset.pick;
      const inGame = view.phase !== "lobby";
      const set = new Set(inGame ? view.upcoming.selected : view.selection);
      if (box.checked) set.add(id);
      else set.delete(id);
      send(inGame ? "setUpcoming" : "setSelection", { ids: [...set] });
      return;
    }
    if (e.target.id === "setup-select" && e.target.value) {
      const setups = store(SETUPS_KEY) || {};
      const ids = setups[e.target.value];
      if (ids) send(view.phase === "lobby" ? "setSelection" : "setUpcoming", { ids });
    }
  });

  function flashInfo(text) {
    const item = document.createElement("div");
    item.className = "item";
    item.textContent = text;
    els.feed.appendChild(item);
    setTimeout(() => item.remove(), 4000);
  }

  function button(label, type, data, cls = "", confirmText = "") {
    return `<button class="${cls}" data-send="${attr({ type, data })}" ${confirmText ? `data-confirm="${esc(confirmText)}"` : ""}>${esc(label)}</button>`;
  }

  function roundButton(a, cls = "") {
    const { label, style, ...data } = a;
    return button(label, "round", data, `${cls} ${style || ""} big-control`);
  }

  // QR-kode (SVG) som lenker rett til innloggingen for dette spillet
  function qrSvg(url) {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true, alt: "QR-kode for å bli med" });
  }

  // ---------- Tegning ----------

  function draw() {
    if (!view) return;
    els.shareButton.classList.toggle("hidden", !view.joinOpen);
    els.roundLabel.textContent = view.round ? `Spill ${view.round.number} av ${view.round.total} · ${view.round.title}` : "Lobby";
    document.body.classList.toggle("compact", view.phase === "round");
    drawFeed();
    drawBoard();
    drawStage();
    drawControls();
    drawPlanner();
  }

  function drawFeed() {
    view.feed.forEach(item => {
      if (item.id <= seenFeed) return;
      seenFeed = item.id;
      if (GS.now() - item.at > 8000) return;
      const el = document.createElement("div");
      el.className = "item";
      el.textContent = item.text;
      els.feed.appendChild(el);
      setTimeout(() => el.remove(), 6200);
    });
  }

  function drawBoard() {
    if (view.phase === "lobby" || view.phase === "results") {
      render(els.board, "");
      els.board.classList.add("hidden");
      return;
    }
    els.board.classList.remove("hidden");
    const maxPx = els.board.clientHeight - 140;
    const html = view.players.map(p => {
      const h = Math.round(8 + p.height * Math.max(20, maxPx));
      return `<div class="slot ${p.connected ? "" : "offline"}">
        <div class="fig">${figureSvg(p.figure, p.upgrades, { size: 64, crown: p.crown })}</div>
        <div class="pillar" style="height:${h}px"></div>
        <div class="name">${esc(p.name)}</div>
      </div>`;
    }).join("");
    render(els.board, html);
  }

  // Knapper: bare det hosten MÅ trykke. Overstyringer ligger i menyen bak «⋯».
  function drawControls() {
    const buttons = [];
    const menu = [];
    const p = view.phase;
    let autoAt = view.autoAt;

    if (p === "lobby") {
      buttons.push(button("Start spillet", "startGame", {}, "big-control"));
    } else if (p === "intro") {
      buttons.push(button("Start runde", "startRound", {}, "big-control"));
    } else if (p === "betting") {
      menu.push(button("Lås innsatsene nå", "closeBetting"));
    } else if (p === "buyTeammate") {
      if (view.buy.step === "bidding") menu.push(button("Avslutt budrunden nå", "closeBids"));
      if (view.buy.step === "picking") menu.push(button("Hopp over velger", "skipPicker"));
    } else if (p === "leaderPower") {
      menu.push(button("Hopp over lederens valg", "skipLeaderPower"));
    } else if (p === "roundEnd") {
      menu.push(button("Gå videre nå", "continue"));
    } else if (p === "round" && view.game) {
      autoAt = view.game.autoAt;
      (view.game.actions || []).forEach(a => buttons.push(roundButton(a)));
      (view.game.menu || []).forEach(a => menu.push(roundButton(a)));
      menu.push(button("Avslutt runden", "endRound", {}, "bad", "Avslutte runden nå?"));
    }

    const pill = autoAt ? `<span class="auto-pill">${view.paused ? "På pause" : `Går videre om ${countdown(autoAt)} s`}</span>` : "";
    if (p !== "lobby" && p !== "results") {
      buttons.unshift(`<button class="secondary planner-toggle" data-planner="1">📋 Velg spill videre</button>`);
      buttons.unshift(view.paused ? button("▶ Fortsett", "resume", {}, "good") : button("⏸ Pause", "pause", {}, "secondary"));
    }
    const menuHtml = menu.length
      ? `<div class="menu ${showMenu ? "" : "hidden"}">${menu.join("")}</div><button class="menu-toggle" data-menu="1" title="Manuelle valg">⋯</button>`
      : "";
    render(els.controls, pill + buttons.join("") + menuHtml);
  }

  function drawStage() {
    const fn = {
      lobby: stageLobby,
      intro: stageIntro,
      betting: stageBetting,
      buyTeammate: stageBuy,
      leaderPower: stageLeaderPower,
      round: stageRound,
      roundEnd: stageRoundEnd,
      results: stageResults
    }[view.phase];
    render(els.stage, fn ? fn() : "");
  }

  // ---------- Faser ----------

  function stageLobby() {
    const figs = view.players.map(p => `
      <div class="lobby-fig">
        ${figureSvg(p.figure, p.upgrades, { size: 76 })}
        <span>${esc(p.name)}${p.bot ? " 🤖" : ""}</span>
        <button class="kick secondary" data-send="${attr({ type: "kick", data: { playerId: p.id } })}" data-confirm="Fjerne ${esc(p.name)}?">✕</button>
      </div>`).join("");


    return `<div class="lobby">
      <div class="col lobby-left">
        <div class="join-big">
          <p class="muted" style="font-size:1.3em">Scan QR-koden med mobilen for å bli med</p>
          <div class="join-qr">${joinQr}</div>
          <button class="secondary" data-share>Del lenke</button>
        </div>
        <div class="lobby-figs">${figs || `<p class="muted">Venter på spillere …</p>`}</div>
        <p class="center muted">${view.players.length} spiller${view.players.length === 1 ? "" : "e"} · minst ${view.minPlayers} for å starte</p>
        <div class="center">${button("+ Legg til bot (testmodus)", "addBot", {}, "secondary small")}</div>
      </div>
      <div class="panel col lobby-right">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Velg spill</h2>
          <span class="tag yellow">ca. ${view.estimatedMinutes} min</span>
        </div>
        ${pickerButtons()}
        <p class="muted" style="margin:0">Appen setter opp rekkefølgen selv. Finalen kommer alltid sist.</p>
        ${gamePicker(view.selection, [])}
      </div>
    </div>`;
  }

  // Avkrysningsliste over spill (brukes i lobbyen og i menyen «Velg spill videre»)
  function gamePicker(selectedIds, lockedIds) {
    const selected = new Set(selectedIds);
    const locked = new Set(lockedIds);
    const list = big => view.games.filter(g => g.big === big).map(g => {
      const isLocked = locked.has(g.id);
      const on = selected.has(g.id);
      return `<label class="game-pick ${on ? "on" : ""} ${isLocked ? "locked" : ""}">
        <input type="checkbox" data-pick="${g.id}" ${on ? "checked" : ""} ${isLocked ? "disabled" : ""}>
        <span class="grow"><b>${esc(g.title)}</b>${g.recommended ? ` <span class="tag ${view.players.length < g.recommended ? "warn" : ""}">Anbefalt ${g.recommended}+ deltakere</span>` : ""}<small>${isLocked ? "Spilt eller pågår nå" : esc(g.desc)}</small></span>
        <span class="minutes">${g.minutes} min</span>
      </label>`;
    }).join("");
    return `<div class="pick-scroll"><h3>Store runder</h3>${list(true)}<h3>Minirunder</h3>${list(false)}</div>`;
  }

  function pickerButtons() {
    const setups = Object.keys(store(SETUPS_KEY) || {});
    const setupSelect = setups.length
      ? `<select id="setup-select"><option value="">Bruk et lagret oppsett …</option>${setups.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>`
      : "";
    return `<div class="row">
      <button class="secondary small" data-select="all">Velg alle</button>
      <button class="secondary small" data-select="none">Fjern alle</button>
      <button class="secondary small" data-save-setup="1">Lagre oppsett</button>
      ${setupSelect}
    </div>`;
  }

  // Menyen «Velg spill videre» under spillet
  function drawPlanner() {
    const available = view && view.upcoming && view.phase !== "lobby" && view.phase !== "results";
    if (!available || !showPlanner) {
      els.planner.classList.add("hidden");
      render(els.planner, "");
      return;
    }
    els.planner.classList.remove("hidden");
    const u = view.upcoming;
    const next = view.plan.slice(view.round ? view.round.number : 0);
    const order = next.length
      ? `<div class="plan-strip" style="justify-content:flex-start">${next.map(g => `<span class="${g.mini ? "mini" : ""}">${esc(g.title)}</span>`).join("")}</div>`
      : `<p class="muted">Ingen flere spill etter dette. Spillet avsluttes etterpå.</p>`;
    render(els.planner, `<div class="panel col planner-panel">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Velg spill videre</h2>
        <span class="tag yellow">ca. ${u.remainingMinutes} min igjen</span>
        <button class="secondary small" data-planner="1">Lukk</button>
      </div>
      <p class="muted" style="margin:0">Gjelder spillene etter «${esc(view.round ? view.round.title : "")}». Endringer lagres med en gang, og appen setter opp rekkefølgen på nytt.</p>
      ${pickerButtons()}
      ${gamePicker(u.selected, u.locked)}
      <div><b>Rekkefølgen videre:</b>${order}</div>
    </div>`);
  }

  function planStrip() {
    if (!view.plan || !view.plan.length) return "";
    const current = view.round ? view.round.number - 1 : -1;
    return `<div class="plan-strip">${view.plan.map((g, i) =>
      `<span class="${i < current ? "done" : i === current ? "now" : ""} ${g.mini ? "mini" : ""}">${esc(g.title)}</span>`).join("")}</div>`;
  }

  function stageIntro() {
    const r = view.round;
    return `<div class="hero">
      <div class="round-no">Spill ${r.number} av ${r.total}${r.mini ? " · Minirunde" : ""}</div>
      <h1>${esc(r.title)}</h1>
      <span class="tag pink">${esc(r.tag)}</span>
      <ul class="rules">${r.rules.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    </div>${planStrip()}`;
  }

  function stageBetting() {
    return `<div class="hero">
      <div class="round-no">Bettingpause!</div>
      <h1>Sats poeng</h1>
      <p style="font-size:1.4em">Sats i hemmelighet på mobilen – <b>før</b> dere vet hva neste spill går ut på.<br>
      Gjør du det bra, vinner du innsatsen. Gjør du det dårlig, taper du den.</p>
      <p class="big-number">${view.betting.placed} / ${view.betting.total}</p>
      <p class="muted">har satset</p>
    </div>`;
  }

  function stageBuy() {
    const b = view.buy;
    let body;
    if (b.step === "bidding") {
      body = `<p style="font-size:1.4em">Vil du velge medspiller selv i neste runde? By poeng i hemmelighet!<br>Høyeste bud velger først.</p>
        <p class="big-number">${b.bidsPlaced} / ${b.total}</p><p class="muted">har budt</p>`;
    } else {
      body = `<p style="font-size:1.6em"><b>${esc(b.pickerName || "")}</b> velger medspiller … ${countdown(b.endsAt)}</p>`;
    }
    const teams = b.teams.length
      ? `<div class="cards">${b.teams.map(t => `<div class="panel center"><b>${t.map(esc).join(" + ")}</b></div>`).join("")}</div>`
      : "";
    return `<div class="hero"><div class="round-no">Før ${esc(view.round.title)}</div><h1>Kjøp en medspiller</h1>${body}</div>${teams}`;
  }

  function stageLeaderPower() {
    return `<div class="hero">
      <div class="round-no">Lederens makt</div>
      <h1>Lederen bestemmer</h1>
      <p style="font-size:1.4em">${esc(view.leaderPower.prompt)} …</p>
      <p class="muted">Valget tas i hemmelighet på lederens mobil.</p>
    </div>`;
  }

  function stageRoundEnd() {
    const lines = view.summary && view.summary.length
      ? `<ul class="rules">${view.summary.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`
      : "";
    return `<div class="hero">
      <div class="round-no">Spill ${view.round.number} av ${view.round.total} er ferdig</div>
      <h1>${esc(view.round.title)}</h1>
      ${lines}
      <p class="muted" style="margin-top:20px">Søylene viser stillingen. Lederrente og catch-up er regnet ut i bakgrunnen.</p>
    </div>${planStrip()}`;
  }

  function stageResults() {
    const res = view.results;
    const byId = Object.fromEntries(view.players.map(p => [p.id, p]));
    const step = (r, height) => r ? `<div class="step">
        ${figureSvg(byId[r.id].figure, byId[r.id].upgrades, { size: 110, crown: r.place === 1 })}
        <b style="font-size:1.4em">${esc(r.name)}</b>
        <div class="block" style="height:${height}px">${r.place}</div>
      </div>` : "";
    const rest = res.slice(3).map(r => `<li>${r.place}. ${esc(r.name)}</li>`).join("");
    return `<div class="hero">
      <div class="round-no">Spillet er over</div>
      <h1>${esc(res[0].name)} vinner!</h1>
    </div>
    <div class="podium">${step(res[1], 120)}${step(res[0], 180)}${step(res[2], 80)}</div>
    ${rest ? `<ul class="rules" style="max-width:500px;margin:0 auto">${rest}</ul>` : ""}`;
  }

  // ---------- Runder ----------

  function stageRound() {
    const g = view.game;
    if (!g) return "";
    const fn = {
      quiz: roundQuiz,
      stand: roundStand,
      vault: roundVault,
      draw: roundDraw,
      mime: roundMime,
      teamDuel: roundTeamDuel,
      alliance: roundAlliance,
      fight: roundFight,
      final: roundFinal,
      lyn: roundLyn,
      dyr: roundDyr,
      tretti: roundTretti,
      tenk: roundTenk,
      auksjon: roundAuksjon,
      reaksjon: roundReaksjon,
      estimat: roundEstimat,
      gruva: roundGruva,
      bilde: roundBilde,
      mafia: roundMafia
    }[g.type];
    return fn ? fn(g) : "";
  }

  function title(text, sub = "") {
    return `<div class="hero"><div class="round-no">${sub}</div><h1 class="mid-title">${esc(text)}</h1></div>`;
  }

  function questionBlock(q, opts = {}) {
    const letters = ["A", "B", "C", "D"];
    const options = q.options.map((o, i) => {
      const cls = q.revealed ? (i === q.correct ? "correct" : "dim") : "";
      return `<div class="option ${cls}"><span class="letter">${letters[i]}</span>${esc(o)}</div>`;
    }).join("");
    return `<div class="quiz-meta">
        <span class="tag">${esc(q.category)}${opts.counter ? ` · ${opts.counter}` : ""}</span>
        ${opts.banner ? `<span class="tag yellow">${esc(opts.banner)}</span>` : ""}
        <span>${q.revealed ? "" : countdown(q.endsAt)}</span>
      </div>
      <div class="quiz-q">${esc(q.text)}</div>
      <div class="options">${options}</div>`;
  }

  function roundQuiz(g) {
    let info = "";
    if (g.question.revealed) {
      if (g.event) info = `<div class="event">${esc(g.event)}</div>`;
      if (g.fastest) info += `<p class="center muted">Raskest: ${esc(g.fastest.name)} (${g.fastest.seconds} s)</p>`;
    } else {
      info = `<p class="center muted">${g.answered} / ${g.totalPlayers} har svart${g.kingName ? ` · Konge: <b style="color:var(--yellow)">${esc(g.kingName)}</b>` : ""}</p>`;
    }
    return `<div class="col" style="gap:18px">${questionBlock(g.question, { counter: `${g.index}/${g.total}` })}${info}</div>`;
  }

  function roundStand(g) {
    let body = "";
    if (g.step === "guess") {
      body = `<p style="font-size:1.4em">Gjett på mobilen hvor mange som kommer til å reise seg.</p>
        <p class="big-number">${g.guessed} / ${g.totalPlayers}</p><p class="muted">har gjettet</p>`;
    } else if (g.step === "stand") {
      body = `<p style="font-size:1.6em">Velg <b>«Stå»</b> eller <b>«Sitt»</b> på mobilen!</p>
        <div class="big-number" style="font-size:9rem">${countdown(g.endsAt)}</div>`;
    } else {
      const rows = g.result.rows.map(r => `<tr>
          <td><b>${esc(r.name)}</b></td>
          <td>${r.guess === null ? "–" : r.guess}</td>
          <td>${r.stood ? "Sto" : "Satt"}</td>
          <td>${r.hit === "exact" ? "🎯 Riktig!" : r.hit === "close" ? "Én unna" : ""}</td>
        </tr>`).join("");
      body = `<p style="font-size:1.6em">REIS DERE NÅ!</p>
        <div class="big-number" style="font-size:7rem">${g.result.standing}</div>
        <p class="muted">reiste seg</p>
        <table class="reveal-table"><tr><th>Spiller</th><th>Gjetning</th><th>Valg</th><th></th></tr>${rows}</table>`;
    }
    return `<div class="hero"><div class="round-no">Omgang ${g.index} av ${g.total}</div><h1 class="mid-title">Hvor mange reiser seg?</h1>${body}</div>`;
  }

  function vaultSlot(name, values, rule) {
    const dice = values.map(v => `<div class="die ${v === null ? "empty" : ""}">${v === null ? "?" : v}</div>`).join(" ");
    return `<div class="slot-box"><h3>${esc(name)}</h3><div class="row" style="justify-content:center">${dice}</div><div class="rule">${esc(rule)}</div></div>`;
  }

  function roundVault(g) {
    if (!g.members) return "";
    const s = g.slots;
    const lamps = Array.from({ length: g.levels }, (_, i) => `<div class="lamp ${i < g.level ? "on" : ""}"></div>`).join("");
    const alarms = Array.from({ length: g.alarmMax }, (_, i) => `<div class="lamp alarm ${i < g.alarm ? "on" : ""}"></div>`).join("");
    const [a, b] = g.members;
    const stepText = {
      talk: "Snakk om strategi nå! Når terningene er kastet, er det helt stille.",
      place: `🤫 Stille! Tur: <b>${esc(g.turnName || "")}</b>`,
      levelResult: "",
      runDone: ""
    }[g.step];
    const tokens = Array.from({ length: g.tokens }, () => "🔷").join(" ") || "–";
    const results = g.results.length
      ? `<p class="muted center">Hittil: ${g.results.map(r => `${r.names.map(esc).join(" og ")}: ${r.cleared} nivå`).join(" · ")}</p>`
      : "";
    return `
      <div class="center"><span class="tag">Par ${g.runIndex + 1} av ${g.runCount}</span> <span class="tag yellow">Nivå ${Math.min(g.level + 1, g.levels)} av ${g.levels}</span></div>
      <div class="vault">
        <div class="col" style="align-items:center">${figureSvg(a.figure, a.upgrades, { size: 90 })}<b>${esc(a.name)}</b><span class="muted">${g.diceLeft[0]} terninger igjen</span></div>
        <div class="col">
          <div class="row" style="justify-content:space-between">
            <div><div class="muted">Nivåer</div><div class="lamps">${lamps}</div></div>
            <div><div class="muted">Alarm</div><div class="lamps">${alarms}</div></div>
          </div>
          <div class="slots">
            ${vaultSlot("Balanse", s.balance, `Forskjell maks ${s.balanceMaxDiff}`)}
            ${vaultSlot("Kode", s.code, `Summen må bli ${s.codeTarget}`)}
            ${vaultSlot("Lås", [s.lock], `Må være ${s.lockValue}`)}
            <div class="slot-box"><h3>Fokus</h3><div style="font-size:1.6em">${tokens}</div><div class="rule">Poletter: juster en terning ±1</div></div>
          </div>
        </div>
        <div class="col" style="align-items:center">${figureSvg(b.figure, b.upgrades, { size: 90 })}<b>${esc(b.name)}</b><span class="muted">${g.diceLeft[1]} terninger igjen</span></div>
      </div>
      <p class="center" style="font-size:1.3em">${stepText}</p>
      ${g.event ? `<div class="event">${esc(g.event)}</div>` : ""}
      ${g.upcoming.length ? `<p class="center muted">Neste: ${g.upcoming.map(n => n.map(esc).join(" og ")).join(" · ")}</p>` : ""}
      ${results}`;
  }

  function roundDraw(g) {
    const cards = g.teams.map(t => {
      let status;
      if (t.status === "done") status = `<p><b>Ferdig!</b> ${t.solved} av ${g.figures} riktige</p>`;
      else status = `<p>Figur ${t.level} av ${g.figures} · ${countdown(t.endsAt)} s</p><p class="muted">Forklarer: ${esc(t.explainer)}</p>`;
      let fb = "";
      if (t.feedback && GS.now() - t.feedback.at < 4000) {
        fb = { correct: "✅ Riktig!", wrong: "❌ Ikke helt …", timeout: "⏰ Tiden ute" }[t.feedback.kind] || "";
      }
      return `<div class="panel center">
        <h3>${t.names.map(esc).join(" + ")}</h3>
        ${status}
        ${t.grid ? `<div style="max-width:220px;margin:0 auto">${gridHtml(t.grid, g.grid)}</div>` : ""}
        <p class="event" style="font-size:1.2em;min-height:1.4em">${fb}</p>
      </div>`;
    }).join("");
    return `<div class="hero"><h1 class="mid-title">Tegn etter beskrivelse</h1>
      <p>Forklar med ord – ikke vis skjermen!</p></div>
      <div class="cards">${cards}</div>`;
  }

  function teamFigs(players) {
    return players.map(p => `<div class="col" style="align-items:center;gap:2px">${figureSvg(p.figure, p.upgrades, { size: 54 })}<small>${esc(p.name)}</small></div>`).join("");
  }

  function roundMime(g) {
    const teams = g.teams.map((t, i) => `
      <div class="team ${g.currentTeam === i ? "active" : ""}">
        <div class="row" style="justify-content:space-between"><h2>Lag ${i + 1}</h2><span class="big-number" style="font-size:3rem">${g.teamWords[i]}</span></div>
        <div class="figs">${teamFigs(t)}</div>
      </div>`).join("");
    let body;
    if (g.step === "ready") {
      body = `<p style="font-size:1.5em">Lag ${g.currentTeam + 1} sin tur! Forklarer: <b>${esc(g.explainerName)}</b> · Mimer: <b>${esc(g.mimerName)}</b></p>
        <p class="muted">Forklareren starter turen på mobilen.</p>`;
    } else if (g.step === "playing") {
      body = `<div class="big-number" style="font-size:8rem">${countdown(g.endsAt)}</div>
        <p style="font-size:1.4em">Forklarer: <b>${esc(g.explainerName)}</b> · Mimer: <b>${esc(g.mimerName)}</b> · ${g.wordsThisTurn} ord</p>`;
    } else if (g.step === "turnOver") {
      body = `<p class="event">Tiden er ute! Lag ${g.lastTurn.team + 1} klarte ${g.lastTurn.words} ord.</p>`;
    } else {
      body = `<p class="event">Runden er ferdig!</p>`;
    }
    return `<div class="hero"><div class="round-no">Tur ${g.turn} av ${g.turns}</div>${body}</div><div class="teams">${teams}</div>`;
  }

  function roundTeamDuel(g) {
    const teams = g.teams.map((t, i) => `
      <div class="team ${g.step === "duel" ? "active" : ""}">
        <div class="row" style="justify-content:space-between">
          <h2>Lag ${i + 1}</h2>
          ${g.step !== "qual" ? `<span style="font-size:1.6em">${"🟡".repeat(g.wins[i])}${"⚪".repeat(Math.max(0, g.winsNeeded - g.wins[i]))}</span>` : ""}
        </div>
        <p>Mester: <b style="color:var(--yellow)">${g.champions[i] ? esc(g.champions[i]) : "–"}</b></p>
        <div class="figs">${teamFigs(t)}</div>
      </div>`).join("");
    let middle = "";
    if (g.question) {
      const info = g.question.revealed
        ? (g.event ? `<div class="event">${esc(g.event)}</div>` : "")
        : `<p class="center muted">${g.step === "duel" ? (g.firstName ? `${esc(g.firstName)} var først!` : "Hvem er raskest?") : `${g.answered} / ${g.totalPlayers} har svart`}</p>`;
      middle = questionBlock(g.question, { banner: g.step === "qual" ? "Kvalifisering" : "DUELL" }) + info;
    } else if (g.event) {
      middle = `<div class="event" style="font-size:2.4em">${esc(g.event)}</div>`;
    }
    return `<div class="teams">${teams}</div><div class="col" style="gap:14px">${middle}</div>`;
  }

  function roundAlliance(g) {
    if (g.step === "play") {
      const current = g.teams.find(t => t.current);
      const others = g.teams.map(t => `<span class="tag ${t.current ? "yellow" : ""}">${t.names.map(esc).join(" + ")}${t.status === "stopped" ? ` · ${t.pot}` : ""}</span>`).join(" ");
      const history = current.history.map(h => h.ok ? "✅" : "❌").join(" ");
      const guessText = current.sub === "result"
        ? `<p style="font-size:1.6em">${esc(current.guesserName)} sa <b>${current.lastGuess === "higher" ? "HØYERE" : "LAVERE"}</b> – snu kortet!</p>`
        : `<p style="font-size:1.4em"><b>${esc(current.guesserName)}</b> gjetter: høyere eller lavere?</p>`;
      return `<div class="hero">
          <div class="round-no">Høyere eller lavere</div>
          <div class="figs row" style="justify-content:center">${teamFigs(current.members)}</div>
          <p class="muted">Potten</p>
          <div class="big-number" style="font-size:7rem">${current.pot}</div>
          ${guessText}
          <p style="font-size:1.4em">${history}</p>
          <p class="muted">Riktig: +${g.potPerCorrect} · Feil: potten halveres · Maks ${g.maxGuesses} gjetninger</p>
        </div>
        <div class="center">${others}</div>`;
    }
    if (g.step === "choice") {
      return `<div class="hero">
        <div class="round-no">Allianse eller svik?</div>
        <h1>Del eller ta alt selv</h1>
        <p style="font-size:1.4em">Velg i hemmelighet på mobilen.</p>
        <p class="big-number">${g.chosen} / ${g.totalPlayers}</p><p class="muted">har valgt</p>
      </div>`;
    }
    const cards = g.outcomes.map(o => `<div class="panel center">
        <p class="muted">Pott: ${o.pot}</p>
        ${o.picks.map(p => `<p><b>${esc(p.name)}</b> <span class="choice-chip ${p.take ? "take" : "share"}">${p.take ? "TA ALT" : "DEL"}</span></p>`).join("")}
        <p class="event" style="font-size:1.2em">${esc(o.text)}</p>
      </div>`).join("");
    return `<div class="hero"><h1>Avsløring!</h1></div><div class="cards">${cards}</div>`;
  }

  function roundFight(g) {
    const duels = g.duels.map(d => {
      const fighters = d.fighters.map(f => {
        const pct = Math.max(0, f.hp) / f.maxHp * 100;
        const won = d.done && d.winnerName === f.name;
        return `<div class="col grow" style="align-items:center;gap:4px">
          ${figureSvg(f.figure, f.upgrades, { size: 70, crown: won })}
          <b>${esc(f.name)}</b>
          <div class="hpbar ${pct < 30 ? "low" : ""}" style="width:100%"><div style="width:${pct}%"></div></div>
          <small class="muted">⚔️ ${f.atk} · 🛡️ ${f.def}</small>
        </div>`;
      }).join(`<div style="font-size:2em;font-weight:900;color:var(--pink)">VS</div>`);
      return `<div class="panel">
        <div class="row" style="flex-wrap:nowrap">${fighters}</div>
        <p class="center" style="min-height:2.6em">${d.done ? `<b style="color:var(--yellow)">${esc(d.winnerName)} vinner!</b>` : esc(d.last ? d.last.text : "Klar til kamp!")}</p>
      </div>`;
    }).join("");
    const status = g.step === "choose"
      ? `Velg «Angrip» eller «Forsvar»! ${countdown(g.endsAt)} · ${g.chosen}/${g.totalFighters} har valgt`
      : g.step === "result" ? "…" : "Kampene er over!";
    return `<div class="hero"><div class="round-no">Slag ${g.exchange} av ${g.exchanges}</div><p style="font-size:1.4em">${status}</p></div>
      <div class="cards">${duels}</div>`;
  }

  function roundFinal(g) {
    const [a, b] = g.finalists;
    const fig = (p, choice) => `<div class="col" style="align-items:center">
        ${figureSvg(p.figure, p.upgrades, { size: 120 })}
        <b style="font-size:1.5em">${esc(p.name)}</b>
        ${choice ? `<span class="choice-chip ${choice === "steal" ? "take" : "share"}" style="font-size:1.6em">${choice === "steal" ? "STJEL" : "DEL"}</span>` : ""}
      </div>`;
    const choices = g.reveal ? g.reveal.choices : [null, null];
    let middle = "";
    if (g.step === "talk") {
      middle = `<p class="event" style="font-size:2em">Prat sammen – del eller stjel?</p>
        <p class="center">Overbevis hverandre! Valget kommer om ${countdown(g.endsAt)} s</p>
        <p class="center muted">${g.betsPlaced} av ${g.spectators} tilskuere har satset</p>`;
    } else if (g.step === "choice") {
      middle = `<p class="event" style="font-size:2em">Del eller stjel?</p><p class="center">${g.chosen} / 2 har valgt · ${countdown(g.endsAt)}</p>`;
    } else if (g.reveal) {
      middle = `<p class="event" style="font-size:3em">${esc(g.reveal.outcome)}!</p>`;
    }
    return `<div class="row" style="justify-content:space-around;align-items:center">
        ${fig(a, choices[0])}
        <div class="center"><div class="muted">POTTEN</div><div class="big-number" style="font-size:6rem">${g.pot}</div></div>
        ${fig(b, choices[1])}
      </div>
      <div class="col" style="gap:14px">${middle}</div>`;
  }

  // ---------- Lynrunden ----------

  function roundLyn(g) {
    const head = `<div class="round-no center">Spørsmål ${g.index} av ${g.total}</div>`;
    if (g.step === "countdown") {
      return `<div class="hero"><div class="round-no">Lynrunden</div><h1>Gjør dere klare!</h1>
        <div class="big-number" style="font-size:10rem">${countdown(g.countdownEndsAt)}</div>
        <p style="font-size:1.4em">Første på den røde buzzeren svarer høyt.</p></div>`;
    }
    let body = "";
    if (g.step === "question") {
      body = `<p class="center" style="font-size:1.6em">🔴 Trykk på buzzeren! ${countdown(g.buzzEndsAt)}</p>`;
    } else if (g.step === "answering") {
      body = `<div class="row" style="justify-content:center;gap:24px">
          ${figureSvg(g.buzzer.figure, g.buzzer.upgrades, { size: 110 })}
          <div><div class="event" style="font-size:2.4em">${esc(g.buzzer.name)} svarer!</div>
          ${g.timeUp ? `<div class="event" style="font-size:1.6em">Tiden er ute!</div>` : `<div class="big-number">${countdown(g.answerEndsAt)}</div>`}</div>
        </div>
        ${g.timeUp
          ? `<p class="center" style="font-size:1.6em">Riktig svar: <b>${esc(g.answer)}</b></p>`
          : `<p class="center"><span class="spoiler" title="Hold musen over for å se fasiten">Fasit: ${esc(g.answer)}</span></p>`}`;
    } else {
      body = `<div class="event">${esc(g.result || "")}</div><p class="center" style="font-size:1.6em">Riktig svar: <b>${esc(g.answer)}</b></p>`;
    }
    return `${head}<div class="quiz-q lyn-q">${esc(g.question)}</div>${body}`;
  }

  // ---------- Minirunder ----------

  function roundMafia(g) {
    const figs = g.players.map(p => `<div class="mafia-fig ${p.dead ? "dead" : ""} ${g.mafia && g.mafia.id === p.id ? "is-mafia" : ""}">
        ${figureSvg(p.figure, p.upgrades, { size: 90 })}<b>${esc(p.name)}</b>
        ${p.dead ? `<span>${p.dead === "wrong" ? "☝️ Feil anklage" : "💀 Drept"}</span>` : ""}
        ${g.mafia && g.mafia.id === p.id ? `<span class="tag pink">MAFIA</span>` : ""}
      </div>`).join("");
    const events = g.events.length ? `<div class="mafia-events">${g.events.map(e => `<div>${esc(e)}</div>`).join("")}</div>` : "";
    let head = "";
    if (g.step === "roles") {
      head = title("Se på mobilen – i hemmelighet!", "Blunke-mafia") + `<p class="center" style="font-size:1.4em">Én av dere er mafia. Starter om ${countdown(g.endsAt)} s</p>`;
    } else if (g.step === "play") {
      head = title("Mafiaen er blant oss …", "Blunke-mafia") + `<p class="center" style="font-size:1.4em">Se hverandre i øynene. Blir du blunket til, dør du. ${countdown(g.endsAt)} s</p>`;
    } else {
      head = title(g.result || "", g.mafiaWon ? "Mafiaen vant!" : "Borgerne vant!");
    }
    return `${head}<div class="mafia-figs">${figs}</div>${events}`;
  }

  function progress(done, total, word) {
    return `<p class="center muted" style="font-size:1.2em">${done} / ${total} ${word}</p>`;
  }

  function resultTable(headers, rows) {
    return `<table class="reveal-table"><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
  }

  function roundDyr(g) {
    const list = `<div class="animal-list">${g.items.map(it => `<span>${esc(it.label)}</span>`).join("")}</div>`;
    if (g.step === "write") {
      return title("Hvem er hvilket dyr?", "Minirunde") +
        `<p class="center" style="font-size:1.5em">Skriv et dyr i hemmelighet på mobilen. ${countdown(g.endsAt)}</p>` + progress(g.written, g.totalPlayers, "har skrevet");
    }
    if (g.step === "show") {
      return title("Her er dyrene!", "Ett av dem er falskt") + list +
        `<p class="center muted">Koblingen starter om ${countdown(g.endsAt)} s. Se godt på listen!</p>`;
    }
    if (g.step === "match") {
      return title("Hvem skrev hva?", "Koble på mobilen") + list +
        `<p class="center">${countdown(g.endsAt)} s</p>` + progress(g.matched, g.totalPlayers, "er ferdige");
    }
    const answers = g.answers.map(a => `<div class="panel center ${a.decoy ? "decoy" : ""}">
        <b style="font-size:1.4em">${esc(a.label)}</b>
        <p>${a.decoy ? "🎭 Ekstra dyr – ingen skrev dette!" : a.names.map(esc).join(", ")}</p>
      </div>`).join("");
    const scores = g.scores.map(s => `${esc(s.name)}: ${s.correct} riktige`).join(" · ");
    return title("Fasit!", "Hvem er hvilket dyr?") + `<div class="cards">${answers}</div><p class="center" style="font-size:1.2em">${scores}</p>`;
  }

  function roundTretti(g) {
    if (g.step === "running") {
      return `<div class="hero"><div class="round-no">Gjett 30 sekunder</div><h1 class="mid-title">Start når du vil!</h1>
        <p style="font-size:1.6em">Trykk START på mobilen når du er klar, og STOPP når du tror det har gått nøyaktig 30 sekunder.</p>
        <p class="muted">Ingen klokke. Ingen hjelp. Lykke til!</p></div>`;
    }
    const rows = g.rows.map(r => [`<b>${esc(r.name)}</b>`, r.seconds === null ? "Trykket ikke" : `${r.seconds} s`, `${r.off} s unna`, r.points ? `${r.points}` : "0"]);
    return title("Hvor nær kom dere?", "Gjett 30 sekunder") + resultTable(["Spiller", "Tid", "Bom", "Poeng"], rows);
  }

  function roundTenk(g) {
    const head = `<div class="hero"><div class="round-no">Tenk likt · ${g.index} av ${g.total}</div><h1 class="mid-title">${esc(g.prompt)}</h1></div>`;
    if (g.step === "answer") {
      return head + `<p class="center" style="font-size:1.4em">Skriv det du tror FLEST andre skriver! ${countdown(g.endsAt)}</p>` + progress(g.answered, g.totalPlayers, "har svart");
    }
    const groups = g.groups.map(gr => `<div class="panel center ${gr.count > 1 ? "match" : ""}">
        <b style="font-size:1.5em">${esc(gr.label)}</b>
        <p>${gr.names.map(esc).join(", ")}</p>
        ${gr.count > 1 ? `<span class="tag yellow">+${(gr.count - 1) * 100} hver</span>` : ""}
      </div>`).join("");
    return head + `<div class="cards">${groups || `<p class="center muted">Ingen svarte.</p>`}</div>`;
  }

  function roundAuksjon(g) {
    if (g.step === "bid") {
      return `<div class="hero"><div class="round-no">Auksjonen</div>
        <div class="gift">🎁</div>
        <h1 class="mid-title">En hemmelig pakke</h1>
        <p style="font-size:1.4em">Poeng eller et kort fra shopen – alltid noe positivt. By i hemmelighet på mobilen!</p>
        <div class="big-number">${countdown(g.endsAt)}</div>
        ${progress(g.bidsPlaced, g.totalPlayers, "har budt")}</div>`;
    }
    return `<div class="hero"><div class="gift">🔨</div><h1 class="mid-title">Auksjonen er avgjort!</h1>
      <p class="muted" style="font-size:1.3em">Hvem som vant og hva pakken inneholdt, er hemmelig.</p></div>`;
  }

  function roundReaksjon(g) {
    if (g.step === "running") {
      return `<div class="hero"><div class="round-no">Reaksjonstest</div>
        ${lightsHtml(g.timing)}
        <p style="font-size:1.6em">Trykk på mobilen når lysene slukker!</p>
        <p class="muted">Tyvstart gir −100 poeng.</p></div>`;
    }
    const rows = g.rows.map((r, i) => [
      r.falseStart ? "–" : r.ms === null ? "–" : `${i + 1}.`,
      `<b>${esc(r.name)}</b>`,
      r.falseStart ? "TYVSTART" : r.ms === null ? "Trykket ikke" : `${r.ms} ms`,
      r.points ? `${r.points > 0 ? "+" : ""}${r.points}` : ""
    ]);
    return title("Reaksjonstider", "Reaksjonstest") + resultTable(["", "Spiller", "Tid", "Poeng"], rows);
  }

  function roundEstimat(g) {
    const head = `<div class="hero"><div class="round-no">Estimering · ${g.index} av ${g.total}</div>
      <h1 class="mid-title">${esc(g.question)}</h1><span class="tag pink">Svar i ${esc(g.unit)}</span></div>`;
    if (g.step === "answer") {
      return head + `<div class="big-number center">${countdown(g.endsAt)}</div>` + progress(g.answered, g.totalPlayers, "har svart");
    }
    const rows = g.rows.map(r => [`${r.place}.`, `<b>${esc(r.name)}</b>`, formatNumber(r.value), r.points ? `+${r.points}` : ""]);
    return head + `<p class="center" style="font-size:1.6em">Fasit: <b style="color:var(--yellow)">${formatNumber(g.answer)} ${esc(g.unit)}</b></p>` +
      (rows.length ? resultTable(["", "Spiller", "Gjetning", "Poeng"], rows) : `<p class="center muted">Ingen svarte.</p>`);
  }

  function formatNumber(n) {
    return Number(n).toLocaleString("nb-NO");
  }

  function roundGruva(g) {
    const inside = g.players.filter(p => !p.out);
    const outside = g.players.filter(p => p.out);
    const figs = list => list.map(p => `<div class="col" style="align-items:center;gap:2px">${figureSvg(p.figure, p.upgrades, { size: 56 })}<small>${esc(p.name)}</small></div>`).join("");
    let top;
    if (g.step === "running") {
      top = `<div class="mine-big">${mineHtml(g)}</div><p class="center" style="font-size:1.3em">Trykk «Ta poengene» på mobilen før gruva raser!</p>`;
    } else if (g.crashed) {
      top = `<div class="mine-big crash">RAS! −500</div><p class="center" style="font-size:1.3em">Gruva raste etter ${g.crashSeconds} sekunder.</p>`;
    } else {
      top = `<div class="mine-big">Alle kom seg ut!</div><p class="center" style="font-size:1.3em">Gruva ville rast etter ${g.crashSeconds} sekunder.</p>`;
    }
    return `<div class="round-no center">Gruva</div>${top}
      <div class="teams">
        <div class="team ${g.step === "running" ? "active" : ""}"><h2>⛏️ I gruva</h2><div class="figs">${figs(inside) || `<span class="muted">Tom</span>`}</div></div>
        <div class="team"><h2>☀️ Ute</h2><div class="figs">${figs(outside) || `<span class="muted">Ingen ennå</span>`}</div></div>
      </div>`;
  }

  function roundBilde(g) {
    const img = g.image.src
      ? `<img src="${esc(g.image.src)}" alt="">`
      : `<span class="zoom-emoji">${g.image.emoji}</span>`;
    const done = g.step === "reveal" ? `data-done="1"` : "";
    const figs = g.players.map(p => `<div class="col zoom-player" style="align-items:center;gap:2px">
        ${figureSvg(p.figure, p.upgrades, { size: 46 })}<small>${esc(p.name)}</small>${p.solved ? `<span class="check">✓</span>` : ""}
      </div>`).join("");
    return `<div class="round-no center">Bildezoom · ${g.index} av ${g.total} ${g.step === "zoom" ? `· ${countdown(g.endsAt)} s` : ""}</div>
      <div class="zoom-frame">
        <div class="zoom-inner" data-zoom data-start="${g.startedAt}" data-dur="${g.zoomMs}" data-z="${g.startZoom}" ${done}
          style="transform-origin:${g.focus.x}% ${g.focus.y}%">${img}</div>
      </div>
      ${g.step === "reveal" ? `<div class="event" style="font-size:2em">Det var: ${esc(g.answer)}!</div>` : `<p class="center">Gjett på mobilen – jo tidligere, jo flere poeng!</p>`}
      <div class="row" style="justify-content:center;gap:14px">${figs}</div>`;
  }

  window.addEventListener("resize", () => view && drawBoard());
})();

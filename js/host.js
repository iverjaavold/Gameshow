/*
  Hovedskjermen. Viser poengtavle (søyler uten tall), rundeinfo og avsløringer,
  og har knappene hosten bruker for å styre spillet.
*/

(function() {
  const { esc, attr, api, connect, countdown, render, figureSvg, gridHtml, store } = GS;
  const params = new URLSearchParams(location.search);
  const code = (params.get("kode") || "").toUpperCase();
  const token = store(`gs-host-${code}`);

  const els = {
    code: document.getElementById("code"),
    joinHint: document.getElementById("join-hint"),
    roundLabel: document.getElementById("round-label"),
    connection: document.getElementById("connection"),
    feed: document.getElementById("feed"),
    stage: document.getElementById("stage"),
    board: document.getElementById("board"),
    controls: document.getElementById("controls")
  };

  if (!code || !token) {
    els.stage.innerHTML = `<div class="panel center"><h2>Fant ikke spillet</h2><p><a href="./" style="color:var(--yellow)">Tilbake til forsiden</a></p></div>`;
    return;
  }

  els.code.textContent = code;
  const joinUrl = `${location.host}`;
  let view = null;
  let seenFeed = 0;
  let showMenu = false;

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

  // Klikk på knapper med data-send='{"type":..,"data":..}'
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-send]");
    if (btn) {
      const { type, data } = JSON.parse(btn.dataset.send);
      if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
      send(type, data || {});
      return;
    }
    if (e.target.closest("[data-menu]")) {
      showMenu = !showMenu;
      drawControls();
    }
  });

  function button(label, type, data, cls = "", confirmText = "") {
    return `<button class="${cls}" data-send="${attr({ type, data })}" ${confirmText ? `data-confirm="${esc(confirmText)}"` : ""}>${esc(label)}</button>`;
  }

  function roundButton(a, cls = "") {
    const { label, ...data } = a;
    return button(label, "round", data, cls);
  }

  // ---------- Tegning ----------

  function draw() {
    if (!view) return;
    els.joinHint.innerHTML = view.joinOpen ? `Bli med på <b>${esc(joinUrl)}</b>` : "";
    els.roundLabel.textContent = view.round ? `Runde ${view.round.number} av 10 · ${view.round.title}` : "Lobby";
    document.body.classList.toggle("compact", view.phase === "round");
    drawFeed();
    drawBoard();
    drawStage();
    drawControls();
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

  function drawControls() {
    const buttons = [];
    const p = view.phase;
    if (p === "lobby") {
      buttons.push(button("Start spillet", "startGame", {}, "", ""));
    } else if (p === "intro") {
      buttons.push(button("Start runden", "startRound"));
    } else if (p === "betting") {
      buttons.push(button("Lås innsatsene", "closeBetting"));
    } else if (p === "buyTeammate") {
      if (view.buy.step === "bidding") buttons.push(button("Avslutt budrunden", "closeBids"));
      if (view.buy.step === "picking") buttons.push(button("Hopp over velger", "skipPicker", {}, "secondary"));
    } else if (p === "leaderPower") {
      buttons.push(button("Hopp over lederens valg", "skipLeaderPower", {}, "secondary"));
    } else if (p === "roundEnd") {
      buttons.push(button(view.round.number >= 10 ? "Vis resultatet" : "Fortsett", "continue"));
    } else if (p === "round" && view.game && view.game.actions) {
      view.game.actions.forEach(a => buttons.push(roundButton(a)));
      buttons.push(`<button class="menu-toggle" data-menu="1">⋯</button>`);
      if (showMenu) buttons.unshift(button("Avslutt runden", "endRound", {}, "bad", "Avslutte runden nå?"));
    }
    render(els.controls, buttons.join(""));
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
        ${figureSvg(p.figure, p.upgrades, { size: 90 })}
        <span>${esc(p.name)}</span>
        <button class="kick secondary" data-send="${attr({ type: "kick", data: { playerId: p.id } })}" data-confirm="Fjerne ${esc(p.name)}?">✕</button>
      </div>`).join("");
    return `
      <div class="join-big">
        <p class="muted" style="font-size:1.4em">Gå til <b style="color:white">${esc(joinUrl)}</b> på mobilen og skriv inn koden</p>
        <div class="code">${esc(code)}</div>
      </div>
      <div class="lobby-figs">${figs || `<p class="muted">Venter på spillere …</p>`}</div>
      <p class="center muted">${view.players.length} spiller${view.players.length === 1 ? "" : "e"} · minst ${view.minPlayers} for å starte</p>`;
  }

  function stageIntro() {
    const r = view.round;
    return `<div class="hero">
      <div class="round-no">Runde ${r.number}</div>
      <h1>${esc(r.title)}</h1>
      <span class="tag pink">${esc(r.tag)}</span>
      <ul class="rules">${r.rules.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    </div>`;
  }

  function stageBetting() {
    return `<div class="hero">
      <div class="round-no">Bettingpause!</div>
      <h1>Sats poeng</h1>
      <p style="font-size:1.4em">Sats i hemmelighet på mobilen – <b>før</b> dere vet hva neste runde går ut på.<br>
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
    return `<div class="hero"><div class="round-no">Før runde ${view.round.number}</div><h1>Kjøp en medspiller</h1>${body}</div>${teams}`;
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
      <div class="round-no">Runde ${view.round.number} er ferdig</div>
      <h1>${esc(view.round.title)}</h1>
      ${lines}
      <p class="muted" style="margin-top:20px">Søylene viser stillingen. Lederrente og catch-up er regnet ut i bakgrunnen.</p>
    </div>`;
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
      final: roundFinal
    }[g.type];
    return fn ? fn(g) : "";
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
      if (g.correctNames) info += `<p class="center">${g.correctNames.length ? `Riktig: ${g.correctNames.map(esc).join(", ")}` : "Ingen svarte riktig."}</p>`;
    } else {
      info = `<p class="center muted">${g.answered} / ${g.totalPlayers} har svart${g.kingName ? ` · Konge: <b style="color:var(--yellow)">${esc(g.kingName)}</b>` : ""}</p>`;
    }
    return `<div class="col" style="gap:18px">${questionBlock(g.question, { counter: `${g.index}/${g.total}`, banner: g.banner })}${info}</div>`;
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
        <div class="big-number" style="font-size:9rem">${g.result.standing}</div>
        <p class="muted">reiste seg</p>
        <table class="reveal-table"><tr><th>Spiller</th><th>Gjetning</th><th>Valg</th><th></th></tr>${rows}</table>`;
    }
    return `<div class="hero"><div class="round-no">Omgang ${g.index} av ${g.total}</div><h1>Hvor mange reiser seg?</h1>${body}</div>`;
  }

  function vaultSlot(title, values, rule) {
    const dice = values.map(v => `<div class="die ${v === null ? "empty" : ""}">${v === null ? "?" : v}</div>`).join(" ");
    return `<div class="slot-box"><h3>${esc(title)}</h3><div class="row" style="justify-content:center">${dice}</div><div class="rule">${esc(rule)}</div></div>`;
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
    return `<div class="hero"><h1 style="font-size:3rem">Tegn etter beskrivelse</h1>
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
      body = `<p style="font-size:1.5em">Lag ${g.currentTeam + 1} sin tur! Forklarer: <b>${esc(g.explainerName)}</b> · Mimer: <b>${esc(g.mimerName)}</b></p>`;
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
        <p class="big-number">${g.chosen} / ${g.totalPlayers}</p><p class="muted">har valgt · ${countdown(g.endsAt)} s</p>
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
    if (g.step === "pot" && g.question) {
      const info = g.question.revealed
        ? `<p class="center">${g.correctNames.length ? `Riktig: ${g.correctNames.map(esc).join(", ")}` : "Ingen riktige."}</p>`
        : `<p class="center muted">${g.answered} / 2 har svart</p>`;
      middle = questionBlock(g.question, { counter: `${g.index}/${g.total}`, banner: "Bygg potten" }) + info
        + `<p class="center muted">${g.betsPlaced} av ${g.spectators} tilskuere har satset</p>`;
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

  window.addEventListener("resize", () => view && drawBoard());
})();

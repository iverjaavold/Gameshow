/*
  Mobilen til spilleren. Viser hemmelige valg, terninger, ord, rutenett,
  shop og kortbeholdning. All tilstand kommer fra serveren.
*/

(function() {
  const { esc, attr, api, connect, countdown, render, figureSvg, FIGURE_OPTIONS, gridHtml, shapeSvg, store } = GS;
  const params = new URLSearchParams(location.search);
  const code = (params.get("kode") || "").toUpperCase();
  const tokenKey = `gs-player-${code}`;

  const els = {
    top: document.getElementById("top"),
    main: document.getElementById("main"),
    overlay: document.getElementById("overlay"),
    toasts: document.getElementById("toasts")
  };

  let token = store(tokenKey);
  let view = null;
  let seenToast = store(`gs-toast-${code}`) || 0;

  // Lokal UI-tilstand (ikke hemmelig, bare for denne mobilen)
  const ui = {
    overlay: null, // null | shop | cards | figure
    cardId: null, // valgt kort som skal brukes
    figure: store("gs-figure") || { color: FIGURE_OPTIONS.color[5], body: "rund", eyes: "glad", hat: "ingen" },
    dieId: null,
    adjust: 0,
    shape: "trekant",
    color: "rød",
    rot: 0,
    erase: false,
    finalOutcome: null
  };

  if (!code) {
    location.href = "./";
    return;
  }

  GS.startCountdowns();

  // ---------- Oppstart ----------

  async function boot() {
    if (token) {
      try {
        const res = await api("/api/check", { code, token });
        if (res.isPlayer) return start();
      } catch (e) {
        if (/Fant ikke spillet/.test(e.message)) return showMissing();
      }
      token = null;
      store(tokenKey, null);
    }
    try {
      await api("/api/check", { code });
      showJoin();
    } catch (e) {
      showMissing();
    }
  }

  function showMissing() {
    els.main.innerHTML = `<div class="waiting"><h1>Fant ikke spillet</h1><p>Sjekk koden og prøv igjen.</p><p><a href="./" style="color:var(--yellow)">Til forsiden</a></p></div>`;
  }

  function figureBuilder() {
    const f = ui.figure;
    const row = (key, labels) => `<div class="choice-row">${FIGURE_OPTIONS[key].map(v => `
      <button type="button" class="secondary ${f[key] === v ? "selected" : ""}" data-fig="${key}" data-val="${esc(v)}">${esc(labels ? labels[v] || v : v)}</button>`).join("")}</div>`;
    const colors = `<div class="choice-row">${FIGURE_OPTIONS.color.map(c => `
      <button type="button" class="swatch ${f.color === c ? "selected" : ""}" style="background:${c}" data-fig="color" data-val="${c}" aria-label="Farge"></button>`).join("")}</div>`;
    return `
      <div class="builder-preview">${figureSvg(f, {}, { size: 130 })}</div>
      <div class="col"><b>Farge</b>${colors}</div>
      <div class="col"><b>Kropp</b>${row("body")}</div>
      <div class="col"><b>Ansikt</b>${row("eyes")}</div>
      <div class="col"><b>Hodeplagg</b>${row("hat")}</div>`;
  }

  function showJoin(error = "") {
    const html = `
      <h1>Bli med i ${esc(code)}</h1>
      <form id="join" class="col">
        <label for="name" class="big">Ditt navn</label>
        <input id="name" maxlength="16" autocomplete="off" placeholder="Navn" required />
        <p class="muted" style="margin:0">Mistet du forbindelsen? Skriv samme navn som før, så kommer du tilbake.</p>
        <h2 style="margin-top:10px">Lag figuren din</h2>
        <div id="builder" class="col">${figureBuilder()}</div>
        <button type="submit" class="huge-btn">Bli med!</button>
        <p class="error-text">${esc(error)}</p>
      </form>`;
    els.main.innerHTML = html;
    document.getElementById("join").addEventListener("submit", async e => {
      e.preventDefault();
      const name = document.getElementById("name").value.trim();
      if (!name) return;
      try {
        const res = await api("/api/join", { code, name, figure: ui.figure });
        token = res.token;
        store(tokenKey, token);
        store("gs-figure", ui.figure);
        start();
      } catch (err) {
        const keep = document.getElementById("name").value;
        showJoin(err.message);
        document.getElementById("name").value = keep;
      }
    });
  }

  function start() {
    els.main.innerHTML = `<div class="waiting"><p>Kobler til …</p></div>`;
    connect(code, token, v => {
      view = v;
      draw();
    }, status => {
      if (status === "kicked" || status === "gone") {
        store(tokenKey, null);
        els.top.classList.add("hidden");
        els.overlay.classList.add("hidden");
        els.main.innerHTML = `<div class="waiting"><h1>${status === "kicked" ? "Du ble fjernet fra spillet" : "Spillet er over"}</h1><p><a href="./" style="color:var(--yellow)">Til forsiden</a></p></div>`;
      }
    });
  }

  // ---------- Handlinger ----------

  async function send(type, data) {
    try {
      await api("/api/action", { code, token, type, data });
      return true;
    } catch (e) {
      toast(e.message, true);
      return false;
    }
  }

  function round(action, data = {}) {
    return send("round", { action, ...data });
  }

  function toast(text, error = false) {
    const el = document.createElement("div");
    el.className = `toast ${error ? "error" : ""}`;
    el.textContent = text;
    el.addEventListener("click", () => el.remove());
    els.toasts.appendChild(el);
    while (els.toasts.children.length > 3) els.toasts.firstChild.remove();
    setTimeout(() => el.remove(), error ? 3500 : 4000);
  }

  document.addEventListener("click", async e => {
    const t = e.target.closest("button, [data-cell]");
    if (!t) return;

    // Figurbygger
    if (t.dataset.fig) {
      ui.figure = { ...ui.figure, [t.dataset.fig]: t.dataset.val };
      const builder = document.getElementById("builder");
      if (builder) builder.innerHTML = figureBuilder();
      return;
    }
    if (t.dataset.send) {
      const { type, data } = JSON.parse(t.dataset.send);
      if (t.dataset.confirm && !confirm(t.dataset.confirm)) return;
      t.disabled = true;
      await send(type, data || {});
      t.disabled = false;
      return;
    }
    if (t.dataset.ui) {
      handleUi(t.dataset.ui, t.dataset);
      return;
    }
    if (t.dataset.cell !== undefined) {
      placeShape(Number(t.dataset.cell));
    }
  });

  async function handleUi(action, data) {
    switch (action) {
      case "open":
        ui.overlay = data.panel;
        ui.cardId = null;
        if (data.panel === "figure") ui.figure = { ...view.me.figure };
        break;
      case "close":
        ui.overlay = null;
        ui.cardId = null;
        break;
      case "pickCard":
        ui.cardId = data.card;
        break;
      case "useOn": {
        const card = view.me.inventory.find(c => c.id === ui.cardId);
        const target = view.others.find(o => o.id === data.target);
        if (!card || !target) break;
        const text = card.card === "steal"
          ? `Stjele ${card.value} poeng fra ${target.name}? Husk å si det høyt!`
          : `Bruke Blokk på ${target.name}? Neste bonus hen får, blir stoppet.`;
        if (!confirm(text)) break;
        if (await send("useCard", { cardId: card.id, targetId: target.id })) {
          ui.overlay = null;
          ui.cardId = null;
          if (card.card === "steal") toast(`Si det høyt: «${target.name}, jeg stjeler fra deg!»`);
        }
        break;
      }
      case "saveFigure":
        store("gs-figure", ui.figure);
        if (await send("figure", { figure: ui.figure })) ui.overlay = null;
        break;
      case "die":
        ui.dieId = Number(data.die);
        break;
      case "adjust":
        ui.adjust = Number(data.v);
        break;
      case "placeDie":
        if (!ui.dieId) {
          toast("Velg en terning først.", true);
          break;
        }
        if (await round("place", { dieId: ui.dieId, slot: data.slot, adjust: data.slot === "focus" ? 0 : ui.adjust })) {
          ui.dieId = null;
          ui.adjust = 0;
        }
        break;
      case "shape":
        ui.shape = data.v;
        ui.erase = false;
        break;
      case "color":
        ui.color = data.v;
        ui.erase = false;
        break;
      case "rotate":
        ui.rot = (ui.rot + 1) % 4;
        break;
      case "erase":
        ui.erase = !ui.erase;
        break;
      case "betQuick": {
        const input = document.getElementById(data.input);
        if (input) {
          input.value = data.v;
          input.dataset.dirty = "1";
        }
        return;
      }
      case "sendAmount": {
        const input = document.getElementById(data.input);
        const amount = Math.floor(Number(input && input.value));
        if (!Number.isFinite(amount) || amount < 0) {
          toast("Skriv inn et tall.", true);
          return;
        }
        if (data.kind === "finalBet") {
          if (!ui.finalOutcome) {
            toast("Velg hva du tror skjer først.", true);
            return;
          }
          if (await round("bet", { outcome: ui.finalOutcome, stake: amount })) toast("Innsatsen er registrert.");
        } else if (await send(data.kind, { amount })) {
          toast("Registrert!");
          if (input) delete input.dataset.dirty;
        }
        return;
      }
      case "finalOutcome":
        ui.finalOutcome = data.v;
        break;
      case "lpPick": {
        const picked = ui.lpPicked || [];
        ui.lpPicked = picked.includes(data.id) ? picked.filter(x => x !== data.id) : picked.concat(data.id).slice(-2);
        break;
      }
    }
    draw();
  }

  function placeShape(index) {
    const g = view && view.game;
    if (!g || g.type !== "draw" || g.role !== "builder") return;
    const current = g.board[index];
    let cell = { s: ui.shape, c: ui.color, r: ui.rot };
    if (ui.erase) cell = null;
    else if (current && current.s === cell.s && current.c === cell.c && current.r === cell.r) cell = null;
    round("cell", { index, cell });
  }

  function sendBtn(label, type, data, cls = "", confirmText = "") {
    return `<button class="${cls}" data-send="${attr({ type, data })}" ${confirmText ? `data-confirm="${esc(confirmText)}"` : ""}>${label}</button>`;
  }

  function roundBtn(label, action, data = {}, cls = "") {
    return sendBtn(label, "round", { action, ...data }, cls);
  }

  function uiBtn(label, action, data = {}, cls = "") {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ");
    return `<button class="${cls}" data-ui="${action}" ${attrs}>${label}</button>`;
  }

  // ---------- Tegning ----------

  function draw() {
    if (!view) return;
    drawToasts();
    drawTop();
    drawOverlay();
    render(els.main, drawMain());
  }

  function drawToasts() {
    let newest = seenToast;
    view.toasts.forEach(t => {
      if (t.id <= seenToast) return;
      toast(t.text);
      newest = Math.max(newest, t.id);
    });
    if (newest !== seenToast) {
      seenToast = newest;
      store(`gs-toast-${code}`, seenToast);
      send("seenToasts", { upTo: seenToast });
    }
  }

  function drawTop() {
    const me = view.me;
    els.top.classList.remove("hidden");
    const cards = me.inventory.length;
    render(els.top, `
      <div class="who">${figureSvg(me.figure, me.upgrades, { size: 30 })}<b>${esc(me.name)}</b>
        ${me.catchUp ? `<span class="badge">×2 (${me.catchUp})</span>` : ""}</div>
      <span class="score">${me.score} p</span>
      ${view.shop.open ? uiBtn("🛒", "open", { panel: "shop" }, "secondary") : ""}
      ${uiBtn(`🃏 ${cards}`, "open", { panel: "cards" }, "secondary")}`);
  }

  function drawOverlay() {
    // Tyveri mot deg går foran alt annet.
    if (view.theftIncoming) {
      const t = view.theftIncoming;
      els.overlay.className = "overlay theft";
      render(els.overlay, `<div class="sheet">
        <h1 style="color:white">TYVERI!</h1>
        <p class="big">${esc(t.thiefName)} prøver å stjele ${t.value} poeng fra deg!</p>
        ${countdown(t.endsAt)}
        ${t.hasUno ? sendBtn("🔄 Uno reverse", "respondTheft", { response: "uno" }, "huge-btn pink") : ""}
        ${t.hasBlock ? sendBtn("🛡️ Blokk", "respondTheft", { response: "block" }, "huge-btn good") : ""}
        ${!t.hasUno && !t.hasBlock ? `<p class="muted">Du har ingen kort som kan stoppe det. Shopen er sperret.</p>` : ""}
        ${sendBtn("Godta", "respondTheft", { response: "accept" }, "secondary")}
      </div>`);
      return;
    }
    if (!ui.overlay) {
      els.overlay.className = "overlay hidden";
      render(els.overlay, "");
      return;
    }
    els.overlay.className = "overlay";
    const head = title => `<div class="sheet-head"><h2>${title}</h2>${uiBtn("Lukk", "close", {}, "secondary")}</div>`;
    let html = "";
    if (ui.overlay === "shop") html = head("Shop") + shopHtml();
    if (ui.overlay === "cards") html = head("Dine kort") + cardsHtml();
    if (ui.overlay === "figure") html = head("Endre figur") + `<div id="builder" class="col">${figureBuilder()}</div>${uiBtn("Lagre figuren", "saveFigure", {}, "huge-btn")}`;
    render(els.overlay, `<div class="sheet">${html}</div>`);
  }

  function shopHtml() {
    const shop = view.shop;
    if (!shop.open) return `<p>Shopen er stengt.</p>`;
    if (shop.locked) return `<p class="big">Shopen er sperret mens noen stjeler fra deg!</p>`;
    const me = view.me;
    const items = shop.items.map(item => {
      const level = item.kind === "upgrade" ? me.upgrades[item.upgrade] : null;
      const maxed = item.kind === "upgrade" && level >= item.max;
      const owned = item.kind === "card" ? me.inventory.filter(c => c.name === item.name).length : 0;
      return `<div class="panel item-card">
        <div><b>${esc(item.name)}</b>${level !== null ? ` <span class="tag">${level}/${item.max}</span>` : ""}${owned ? ` <span class="tag">Har ${owned}</span>` : ""}
          <div class="desc">${esc(item.desc)}</div></div>
        ${sendBtn(`${item.price}`, "buy", { itemId: item.id }, "", `Kjøpe ${item.name} for ${item.price} poeng?`).replace("<button", `<button ${maxed || me.score < item.price ? "disabled" : ""}`)}
      </div>`;
    }).join("");
    return `<p class="muted">Bare «1 handling utført» vises på hovedskjermen. Shopen stenger når runde 8 starter.</p>${items}`;
  }

  function cardsHtml() {
    const inv = view.me.inventory;
    if (ui.cardId) {
      const card = inv.find(c => c.id === ui.cardId);
      if (!card) {
        ui.cardId = null;
        return cardsHtml();
      }
      if (view.theftBusy && card.card === "steal") return `<p>Et annet tyveri pågår. Vent litt.</p>${uiBtn("Tilbake", "pickCard", { card: "" }, "secondary")}`;
      const targets = view.others.map(o => uiBtn(esc(o.name), "useOn", { target: o.id }, "secondary")).join("");
      return `<p class="big">${esc(card.name)} – velg spiller:</p><div class="col">${targets}</div>${uiBtn("Tilbake", "pickCard", { card: "" }, "secondary")}`;
    }
    if (!inv.length) return `<p class="muted">Du har ingen kort. Kjøp dem i shopen.</p>`;
    const list = inv.map(c => {
      const canUse = c.card !== "uno";
      return `<div class="panel item-card">
        <div><b>${esc(c.name)}</b><div class="desc">${c.card === "uno" ? "Brukes i svarvinduet når noen stjeler fra deg." : c.card === "block" ? "Brukes i svarvinduet, eller mot en annen spillers neste bonus." : "Stjel fra en annen spiller."}</div></div>
        ${canUse ? uiBtn("Bruk", "pickCard", { card: c.id }) : ""}
      </div>`;
    }).join("");
    return list;
  }

  function waiting(title, text = "") {
    return `<div class="waiting">
      <div class="fig-wrap">${figureSvg(view.me.figure, view.me.upgrades, { size: 110 })}</div>
      <h1>${title}</h1>${text ? `<p class="big muted">${text}</p>` : ""}
    </div>`;
  }

  function drawMain() {
    switch (view.phase) {
      case "lobby":
        return waiting("Du er med!", "Vent på at hosten starter spillet.") +
          uiBtn("Endre figur", "open", { panel: "figure" }, "secondary");
      case "intro":
        return `<div class="waiting"><p class="muted">Runde ${view.round.number}</p><h1>${esc(view.round.title)}</h1>
          <p class="big">${esc(view.round.tag)}</p><p class="muted">Følg med på hovedskjermen!</p></div>`;
      case "betting": return mainBetting();
      case "buyTeammate": return mainBuy();
      case "leaderPower": return mainLeaderPower();
      case "round": return mainRound();
      case "roundEnd":
        return waiting(`Runde ${view.round.number} er ferdig`, `Du har ${view.me.score} poeng.`);
      case "results": {
        const r = view.results;
        return waiting(r.place === 1 ? "Du vant! 🏆" : `Du ble nr. ${r.place} av ${r.total}`, `Vinner: ${esc(r.winner)} · Du endte på ${view.me.score} poeng.`);
      }
    }
    return "";
  }

  function amountForm(id, kind, max, current, label) {
    const quick = [0, 0.1, 0.25, 0.5, 1].map(f => {
      const v = Math.floor(max * f);
      const text = f === 0 ? "0" : f === 1 ? "Alt" : `${f * 100}%`;
      return uiBtn(text, "betQuick", { input: id, v }, "secondary");
    }).join("");
    return `<div class="panel col">
      <label for="${id}" class="big">${label}</label>
      <input id="${id}" type="number" inputmode="numeric" min="0" max="${max}" placeholder="0–${max}" />
      <div class="row">${quick}</div>
      ${uiBtn("Send", "sendAmount", { input: id, kind }, "huge-btn")}
      ${current !== null && current !== undefined ? `<p class="center">Registrert: <b>${current}</b> (du kan endre)</p>` : ""}
    </div>`;
  }

  function mainBetting() {
    const b = view.betting;
    return `<h1>Bettingpause!</h1>
      <p>Sats poeng i hemmelighet. Du vet ikke hva neste runde er! Gjør du det bra (over halvparten av maks poeng), vinner du innsatsen. Ellers taper du den.</p>
      ${amountForm("bet-amount", "bet", b.max, b.myBet, `Innsats (maks ${b.max})`)}`;
  }

  function mainBuy() {
    const b = view.buy;
    if (b.step === "bidding") {
      return `<h1>Kjøp en medspiller</h1>
        <p>By poeng i hemmelighet. Høyeste bud velger medspiller først i neste runde. Budet trekkes fra poengene dine.</p>
        ${amountForm("bid-amount", "bid", view.me.score, b.myBid, "Ditt bud")}`;
    }
    if (b.step === "picking" && b.myTurn) {
      return `<h1>Velg medspiller!</h1><p>${countdown(b.endsAt)} sekunder</p>
        <div class="col">${b.available.map(p => sendBtn(esc(p.name), "pickTeammate", { targetId: p.id }, "huge-btn secondary")).join("")}</div>`;
    }
    return waiting("Kjøp en medspiller", b.pickerName ? `${esc(b.pickerName)} velger …` : "Venter …");
  }

  function mainLeaderPower() {
    const lp = view.leaderPower;
    if (!lp.isLeader) return waiting("Lederen bestemmer …", "Vent litt.");
    if (lp.kind === "option") {
      return `<h1>Du leder!</h1><p class="big">${esc(lp.prompt)}</p>
        <div class="col">${lp.options.map(o => sendBtn(esc(o.label), "leaderPower", { value: o.id }, "huge-btn secondary")).join("")}</div>`;
    }
    // To spillere
    const picked = ui.lpPicked || [];
    const list = lp.options.map(o => `<button class="secondary ${picked.includes(o.id) ? "selected" : ""}" data-ui="lpPick" data-id="${esc(o.id)}">${esc(o.label)}</button>`).join("");
    const ready = picked.length === 2;
    return `<h1>Du leder!</h1><p class="big">${esc(lp.prompt)}</p>
      <div class="col">${list}</div>
      ${ready ? sendBtn("Bekreft", "leaderPower", { value: picked }, "huge-btn") : `<p class="muted center">Velg to spillere.</p>`}`;
  }

  // ---------- Runder ----------

  function mainRound() {
    if (!view.inRound) return waiting("Du er med fra neste runde!", "Følg med på hovedskjermen.");
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

  function questionButtons(q) {
    const letters = ["A", "B", "C", "D"];
    const answered = q.myAnswer !== null;
    const options = q.options.map((o, i) => {
      let cls = "";
      if (q.revealed) cls = i === q.correct ? "correct" : "dim";
      else if (answered) cls = i === q.myAnswer ? "mine" : "dim";
      const inner = `<span class="letter">${letters[i]}</span>${esc(o)}`;
      return answered || q.revealed
        ? `<div class="option ${cls}">${inner}</div>`
        : `<button class="option" data-send="${attr({ type: "round", data: { action: "answer", choice: i } })}">${inner}</button>`;
    }).join("");
    let status = "";
    if (q.revealed) status = q.myAnswer === null ? "Du svarte ikke." : q.wasCorrect ? "✅ Riktig!" : "❌ Feil.";
    else if (answered) status = "Svar sendt!";
    return `<div class="row" style="justify-content:space-between"><span class="tag">${esc(q.category)}</span>${q.revealed ? "" : `<span class="big">${countdown(q.endsAt)}</span>`}</div>
      <p class="big">${esc(q.text)}</p>
      <div class="options">${options}</div>
      ${status ? `<p class="big center">${status}</p>` : ""}`;
  }

  function roundQuiz(g) {
    return `<div class="row" style="justify-content:space-between"><span class="muted">Spørsmål ${g.index}/${g.total}</span>
        ${g.isKing ? `<span class="tag yellow">👑 Du er konge!</span>` : ""}${g.banner ? `<span class="tag pink">${esc(g.banner)}</span>` : ""}</div>
      ${questionButtons(g.question)}
      ${g.event ? `<p class="center muted">${esc(g.event)}</p>` : ""}`;
  }

  function roundStand(g) {
    const head = `<p class="muted">Omgang ${g.index} av ${g.total}</p>`;
    if (g.step === "guess") {
      const nums = Array.from({ length: g.max + 1 }, (_, i) =>
        `<button class="${g.myGuess === i ? "selected" : "secondary"}" data-send="${attr({ type: "round", data: { action: "guess", value: i } })}">${i}</button>`).join("");
      return `${head}<h1>Hvor mange reiser seg?</h1><p>Gjett i hemmelighet (0–${g.max}). Du kan endre helt til timeren starter.</p>
        <div class="num-grid">${nums}</div>
        ${g.myGuess !== null ? `<p class="center big">Din gjetning: ${g.myGuess}</p>` : ""}`;
    }
    if (g.step === "stand") {
      return `${head}<h1>Stå eller sitt? ${countdown(g.endsAt)}</h1>
        <p>Din gjetning: <b>${g.myGuess === null ? "–" : g.myGuess}</b></p>
        <div class="stand-sit">
          ${roundBtn("STÅ", "stand", { stand: true }, g.myChoice === true ? "pink selected" : "secondary")}
          ${roundBtn("SITT", "stand", { stand: false }, g.myChoice === false ? "good selected" : "secondary")}
        </div>
        <p class="center muted">${g.myChoice === null ? "Velger du ikke, sitter du." : g.myChoice ? "Du skal STÅ." : "Du skal SITTE."}</p>`;
    }
    const mine = g.result.mine;
    const res = !mine || mine.guess === null ? "Du gjettet ikke." : mine.hit === "exact" ? "🎯 Riktig gjetning!" : mine.hit === "close" ? "Én unna – litt poeng!" : "Bom.";
    return `${head}<div class="waiting"><p>Antall som reiste seg:</p><div class="big-number">${g.result.standing}</div><p class="big">${res}</p></div>`;
  }

  function roundVault(g) {
    if (g.waiting) {
      return waiting("Hvelvet", g.currentNames ? `${g.currentNames.map(esc).join(" og ")} prøver seg nå.${g.upcoming ? " Dere er senere!" : ""}` : "");
    }
    const s = g.slots;
    const lamps = `Nivå ${Math.min(g.level + 1, g.levels)}/${g.levels} · Alarm ${"🔴".repeat(g.alarm)}${"⚪".repeat(g.alarmMax - g.alarm)} · Poletter ${g.tokens}`;
    const me = g.myIndex;
    const mini = `<div class="mini-vault">
      <div class="panel"><small>Balanse</small><div>${s.balance.map(v => v ?? "?").join(" · ")}</div><small class="muted">maks ${s.balanceMaxDiff} forskjell</small></div>
      <div class="panel"><small>Kode = ${s.codeTarget}</small><div>${s.code.map(v => v ?? "?").join(" + ")}</div></div>
      <div class="panel"><small>Lås = ${s.lockValue}</small><div>${s.lock ?? "?"}</div></div>
    </div>`;
    let body = "";
    if (g.step === "talk") {
      body = `<p class="big">Snakk med ${esc(g.partnerName)} om strategien nå. Etter kastet er det forbudt å snakke!</p>
        ${roundBtn("🎲 Kast terningene", "roll", {}, "huge-btn")}`;
    } else if (g.step === "place") {
      const dice = g.dice.map(d => `<button class="die ${ui.dieId === d.id ? "selected" : ""}" data-ui="die" data-die="${d.id}">${d.v}</button>`).join("");
      if (!g.myTurn) {
        body = `<p class="big">🤫 ${esc(g.partnerName)} sin tur. Ikke snakk!</p><div class="dice-row">${g.dice.map(d => `<div class="die">${d.v}</div>`).join("") || `<span class="muted">Ingen terninger igjen</span>`}</div>`;
      } else {
        const sel = g.dice.find(d => d.id === ui.dieId);
        const adj = g.tokens > 0 && sel ? `<div class="row" style="justify-content:center">
            <span>Bruk polett:</span>
            ${[-1, 0, 1].map(v => uiBtn(v === 0 ? "Ingen" : v > 0 ? "+1" : "−1", "adjust", { v }, ui.adjust === v ? "selected" : "secondary")).join("")}
          </div>` : "";
        const mySlotBalance = s.balance[me] !== null;
        const mySlotCode = s.code[me] !== null;
        const slot = (key, label, hint, disabled) => `<button class="${disabled ? "secondary" : ""}" data-ui="placeDie" data-slot="${key}" ${disabled ? "disabled" : ""}>${label}<small>${hint}</small></button>`;
        body = `<p class="big">Din tur! Velg terning og felt.</p>
          <div class="dice-row">${dice}</div>
          ${adj}
          ${sel ? `<p class="center">Verdi: <b>${Math.min(6, Math.max(1, sel.v + ui.adjust))}</b></p>` : ""}
          <div class="slot-buttons">
            ${slot("balance", "Balanse", "Din side", mySlotBalance)}
            ${slot("code", "Kode", "Din del av summen", mySlotCode)}
            ${slot("lock", "Lås", `Må være ${s.lockValue}`, s.lock !== null)}
            ${slot("focus", "Fokus", "+1 polett", false)}
          </div>`;
      }
    } else {
      const last = g.step === "runDone" ? "" : roundBtn("Neste forsøk", "continue", {}, "huge-btn");
      body = `<p class="big center">${esc(g.event || "")}</p>${last}`;
    }
    return `<h1>Hvelvet</h1><p class="muted">${lamps}</p>${mini}${body}
      ${g.step === "place" && g.event ? `<p class="center muted">${esc(g.event)}</p>` : ""}`;
  }

  function roundDraw(g) {
    if (g.done) return waiting("Ferdig!", g.solved !== undefined ? `Dere klarte ${g.solved} av ${g.figures} figurer.` : "");
    let fb = "";
    if (g.feedback && GS.now() - g.feedback.at < 5000) {
      fb = { correct: "✅ Riktig! Ny figur – roller byttet.", wrong: `❌ Ikke helt. ${g.feedback.wrong} rute(r) er feil.`, timeout: "⏰ Tiden gikk ut. Ny figur – roller byttet." }[g.feedback.kind] || "";
    }
    const head = `<div class="row" style="justify-content:space-between"><span class="tag">Figur ${g.level}/${g.figures}</span><span class="big">${countdown(g.endsAt)}</span></div>
      ${fb ? `<p class="center big">${fb}</p>` : ""}`;
    if (g.role === "explainer") {
      return `${head}<h1>Du forklarer</h1>
        <p>Beskriv figuren med ord for ${g.partnerNames.map(esc).join(" og ")}. <b>Ikke vis skjermen!</b> Form, farge, plassering og retning teller.</p>
        ${gridHtml(g.target, g.grid)}`;
    }
    const shapes = g.shapes.map(s => `<button class="${ui.shape === s && !ui.erase ? "selected" : ""}" data-ui="shape" data-v="${esc(s)}" aria-label="${esc(s)}">${shapeSvg({ s, c: ui.color, r: ui.rot })}</button>`).join("");
    const colors = g.colors.map(c => `<button class="color-btn ${ui.color === c && !ui.erase ? "selected" : ""}" style="background:${GS.SHAPE_COLORS[c]}" data-ui="color" data-v="${esc(c)}" aria-label="${esc(c)}"></button>`).join("");
    return `${head}<h1>Du bygger</h1>
      <p class="muted">${esc(g.explainerName)} forklarer. Trykk i en rute for å sette formen. Trykk igjen for å fjerne.</p>
      ${gridHtml(g.board, g.grid, { clickable: true })}
      <div class="palette">${shapes}</div>
      <div class="palette">${colors}</div>
      <div class="row" style="justify-content:center">
        ${uiBtn(`↻ Roter (${ui.rot * 90}°)`, "rotate", {}, "secondary")}
        ${uiBtn("Viskelær", "erase", {}, ui.erase ? "selected pink" : "secondary")}
        ${roundBtn("Tøm", "clear", {}, "secondary")}
      </div>
      ${roundBtn("Ferdig!", "submit", {}, "huge-btn good")}`;
  }

  function roundMime(g) {
    const team = `<p class="muted">Du er på lag ${g.myTeam + 1}. Lag ${g.currentTeam + 1} sin tur.</p>`;
    if (g.role === "explainer") {
      if (g.step === "ready") return `${team}<h1>Du er forklarer!</h1><p class="big">Mimer: ${esc(g.mimerName)}</p><p>Du får BARE beskrive bevegelser. Aldri ordet eller hva det er.</p>${roundBtn("Start turen", "startTurn", {}, "huge-btn")}`;
      if (g.step === "playing") {
        return `${team}<div class="row" style="justify-content:space-between"><span class="big">${g.wordsThisTurn} ord</span><span class="big">${countdown(g.endsAt)}</span></div>
          <div class="word-card">${esc(g.word || "")}</div>
          <p class="center muted">Beskriv bare bevegelser!</p>
          <div class="stand-sit">${roundBtn("✅ Riktig", "correct", {}, "good")}${roundBtn("⏭ Hopp over", "skip", {}, "secondary")}</div>`;
      }
    }
    const roleText = {
      mimer: `Du er mimer! Gjør bevegelsene ${esc(g.explainerName)} beskriver.`,
      guesser: `Gjett hva ${esc(g.mimerName)} mimer!`,
      audience: "Det andre laget spiller. Hold tett!",
      explainer: "Turen er over."
    }[g.role];
    return `${team}${waiting("Forklar-mime", roleText)}${g.step === "playing" ? `<p class="center big">${countdown(g.endsAt)}</p>` : ""}`;
  }

  function roundTeamDuel(g) {
    const head = `<div class="row" style="justify-content:space-between"><span class="tag">Lag ${g.team}</span>
      ${g.isChampion ? `<span class="tag yellow">⭐ Mester</span>` : ""}
      ${g.step !== "qual" ? `<span>${g.wins[0]} – ${g.wins[1]}</span>` : ""}</div>`;
    if (g.step === "done") return head + waiting("Duellen er over", esc(g.event || ""));
    if (g.question && (g.canAnswer || g.question.revealed)) {
      return `${head}<h1>${g.step === "qual" ? "Kvalifisering" : "DUELL!"}</h1>${questionButtons(g.question)}${g.event ? `<p class="center">${esc(g.event)}</p>` : ""}`;
    }
    const text = g.step === "qual" ? "Laget ditt har en mester! Hei på hen." : "Mesterne duellerer. Følg med på skjermen!";
    return head + waiting("Lagduellen", text);
  }

  function roundAlliance(g) {
    if (g.step === "play") {
      if (!g.ourTurn) {
        return waiting("Allianse eller svik", `${g.currentNames.map(esc).join(" + ")} spiller nå.${g.myStatus === "stopped" ? ` Potten deres: ${g.myPot}` : ""}`);
      }
      const hist = g.history.map(h => h.ok ? "✅" : "❌").join(" ");
      let body;
      if (g.sub === "guess") {
        body = g.amGuesser
          ? `<p class="big">Din tur! Blir neste kort høyere eller lavere?</p>
             <div class="stand-sit">${roundBtn("⬆ Høyere", "guess", { dir: "higher" }, "good")}${roundBtn("⬇ Lavere", "guess", { dir: "lower" }, "pink")}</div>`
          : `<p class="big">${esc(g.guesserName)} gjetter nå.</p>`;
        body += roundBtn(`🛑 Stopp og sikre ${g.myPot}`, "stop", {}, "huge-btn secondary");
      } else {
        body = `<p class="big">${esc(g.guesserName)} sa ${g.lastGuess === "higher" ? "HØYERE" : "LAVERE"}. Snu kortet!</p>
          <div class="stand-sit">${roundBtn("Riktig", "result", { ok: true }, "good")}${roundBtn("Feil", "result", { ok: false }, "bad")}</div>`;
      }
      return `<h1>Høyere eller lavere</h1><p>Potten: <b class="big" style="color:var(--yellow)">${g.myPot}</b> · ${g.guesses}/${g.maxGuesses}</p>
        <p>${hist}</p>${body}
        <p class="muted">Riktig: +100. Feil: potten halveres.</p>`;
    }
    if (g.step === "choice") {
      return `<h1>Del eller ta alt? ${countdown(g.endsAt)}</h1>
        <p>Lagets pott: <b>${g.myPot}</b> (${g.myTeamNames.map(esc).join(", ")})</p>
        <p class="muted">Alle deler: likt fordelt. Én tar: hen får alt. Flere tar: ingen får noe.</p>
        <div class="stand-sit">
          ${roundBtn("🤝 DEL", "choose", { choice: "share" }, g.myChoice === "share" ? "good selected" : "secondary")}
          ${roundBtn("💰 TA ALT", "choose", { choice: "take" }, g.myChoice === "take" ? "bad selected" : "secondary")}
        </div>
        <p class="center muted">${g.myChoice ? "Valget er sendt (du kan endre til avsløringen)." : "Velger du ikke, deler du."}</p>`;
    }
    return waiting("Avsløring!", g.outcome ? esc(g.outcome.text) : "");
  }

  function roundFight(g) {
    const duels = g.duels.map(d => {
      const parts = d.fighters.map(f => {
        const pct = Math.max(0, f.hp) / f.maxHp * 100;
        return `<div class="col grow" style="align-items:center;gap:2px">${figureSvg(f.figure, f.upgrades, { size: 56 })}
          <b>${f.id === g.myId ? "Du" : esc(f.name)}</b>
          <div class="hpbar ${pct < 30 ? "low" : ""}" style="width:100%"><div style="width:${pct}%"></div></div>
          <small>${Math.max(0, f.hp)} liv</small></div>`;
      }).join("<b>VS</b>");
      return `<div class="panel"><div class="row" style="flex-wrap:nowrap">${parts}</div>
        <p class="center">${d.done ? `<b>${esc(d.winnerName)} vant!</b>` : esc(d.last ? d.last.text : "")}</p></div>`;
    }).join("");
    let body = "";
    if (g.step === "choose" && g.active) {
      body = `<h1>Slag ${g.exchange}/${g.exchanges} · ${countdown(g.endsAt)}</h1>
        <div class="stand-sit">
          ${roundBtn("⚔️ Angrip", "choose", { choice: "attack" }, g.myChoice === "attack" ? "pink selected" : "secondary")}
          ${roundBtn("🛡️ Forsvar", "choose", { choice: "defend" }, g.myChoice === "defend" ? "good selected" : "secondary")}
        </div>
        <p class="center muted">Velger du ikke, angriper du.</p>`;
    } else if (g.step === "done" || !g.active) {
      body = `<h1>Kampen er over</h1>`;
    } else {
      body = `<h1>Slag ${g.exchange}/${g.exchanges}</h1><p class="muted">Se resultatet …</p>`;
    }
    return body + duels;
  }

  function roundFinal(g) {
    const names = g.finalistNames.map(esc).join(" og ");
    if (g.finalist) {
      if (g.step === "pot" && g.question) {
        return `<p class="muted">Finale · spørsmål ${g.index}/${g.total}</p><h1>Bygg potten: ${g.pot}</h1>${questionButtons(g.question)}`;
      }
      if (g.step === "choice") {
        return `<h1>Potten: ${g.pot}</h1><p class="big">Del eller stjel? ${countdown(g.endsAt)}</p>
          <p class="muted">Begge deler: potten deles. Én stjeler: hen tar alt. Begge stjeler: ingen får noe.</p>
          <div class="stand-sit">
            ${roundBtn("🤝 DEL", "choose", { choice: "share" }, g.myChoice === "share" ? "good selected" : "secondary")}
            ${roundBtn("🦹 STJEL", "choose", { choice: "steal" }, g.myChoice === "steal" ? "bad selected" : "secondary")}
          </div>`;
      }
      if (g.reveal) return waiting(esc(g.reveal.outcome) + "!", `Potten var ${g.pot}.`);
      return waiting("Finale", `Potten: ${g.pot}`);
    }
    // Tilskuer
    if (g.reveal) {
      const won = g.myBet && g.outcomes.find(o => o.id === g.myBet.outcome)?.label === g.reveal.outcome;
      return waiting(esc(g.reveal.outcome) + "!", g.myBet ? (won ? "Du spådde riktig!" : "Feil spådom.") : "");
    }
    if (g.step !== "pot") return waiting("Finale", `${names} velger nå … Innsatsene er låst.`);
    const outcomes = g.outcomes.map(o => uiBtn(esc(o.label), "finalOutcome", { v: o.id }, ui.finalOutcome === o.id ? "selected" : "secondary")).join("");
    return `<h1>Finale!</h1><p>${names} spiller om potten (<b>${g.pot}</b>). Hva tror du de velger?</p>
      <div class="col">${outcomes}</div>
      ${amountForm("final-stake", "finalBet", g.maxStake, g.myBet ? g.myBet.stake : null, `Innsats (riktig gir ${g.payout}× gevinst)`)}
      ${g.myBet ? `<p class="center">Du har satset ${g.myBet.stake} på «${esc(g.outcomes.find(o => o.id === g.myBet.outcome).label)}».</p>` : ""}`;
  }

  boot();
})();

/*
  Felles kode for hovedskjerm og mobil:
  API-kall, sanntidskobling, nedtellinger, figurtegning og former.
*/

const GS = (function() {
  let serverOffset = 0; // serverens klokke minus vår klokke

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  // JSON i et HTML-attributt
  function attr(obj) {
    return esc(JSON.stringify(obj));
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* tomt svar */ }
    if (!res.ok) throw new Error(data.error || "Noe gikk galt.");
    return data;
  }

  function now() {
    return Date.now() + serverOffset;
  }

  // Kobler til strømmen og kaller onState(view) for hver oppdatering.
  function connect(code, token, onState, onStatus) {
    let source = null;
    let closed = false;

    function open() {
      source = new EventSource(`/api/stream?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);
      source.onopen = () => onStatus && onStatus(true);
      source.onmessage = event => {
        const view = JSON.parse(event.data);
        if (view.serverNow) serverOffset = view.serverNow - Date.now();
        onState(view);
      };
      source.addEventListener("kicked", () => {
        closed = true;
        source.close();
        onStatus && onStatus("kicked");
      });
      source.onerror = () => {
        onStatus && onStatus(false);
        // EventSource prøver selv på nytt. Hvis serveren avviser oss (spillet finnes ikke), stopp.
        if (source.readyState === EventSource.CLOSED && !closed) {
          setTimeout(() => {
            if (closed) return;
            api("/api/check", { code, token }).then(() => open()).catch(() => onStatus && onStatus("gone"));
          }, 2000);
        }
      };
    }

    open();
    return { close() { closed = true; source && source.close(); } };
  }

  // Oppdaterer alle [data-ends]-elementer med gjenstående sekunder.
  function startCountdowns() {
    setInterval(() => {
      document.querySelectorAll("[data-ends]").forEach(el => {
        const ends = Number(el.dataset.ends);
        const left = Math.max(0, Math.ceil((ends - now()) / 1000));
        el.textContent = left;
        el.classList.toggle("low", left <= 3);
      });
    }, 200);
  }

  /*
    Animasjoner som må oppdateres hvert skjermbilde (ikke bare når serveren sender noe):
    - [data-lights]: F1-lys (reaksjonstest). Tennes ett og ett og slukkes samtidig på server-tid.
    - [data-mine]:   gruveverdien som stiger (formelen er kjent, bare rastidspunktet er hemmelig).
    - [data-zoom]:   bildet som zoomer ut (bildezoom).
    onFrame-funksjoner kan legges til av host.js / player.js.
  */
  const frameHandlers = [];
  function onFrame(fn) {
    frameHandlers.push(fn);
  }

  function mineValue(el, t) {
    const pps = Number(el.dataset.pps);
    const accel = Number(el.dataset.accel);
    return Math.floor(pps * t + accel * t * t);
  }

  function animate() {
    const t = now();
    document.querySelectorAll("[data-lights]").forEach(el => {
      const start = Number(el.dataset.lightsAt);
      const step = Number(el.dataset.lightMs);
      const out = Number(el.dataset.outAt);
      [...el.children].forEach((light, i) => {
        light.classList.toggle("on", t >= start + i * step && t < out);
      });
      el.classList.toggle("out", t >= out);
    });
    document.querySelectorAll("[data-mine]").forEach(el => {
      if (el.dataset.frozen) return;
      const secs = (t - Number(el.dataset.start)) / Number(el.dataset.secMs);
      el.textContent = secs < 0 ? `Åpner om ${Math.ceil(-secs)} …` : mineValue(el, secs);
    });
    document.querySelectorAll("[data-zoom]").forEach(el => {
      const p = Math.min(1, Math.max(0, (t - Number(el.dataset.start)) / Number(el.dataset.dur)));
      const scale = el.dataset.done ? 1 : Math.pow(Number(el.dataset.z), 1 - p);
      el.style.transform = `scale(${scale})`;
    });
    frameHandlers.forEach(fn => fn(t));
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  function countdown(endsAt, extraClass = "") {
    if (!endsAt) return "";
    const left = Math.max(0, Math.ceil((endsAt - now()) / 1000));
    return `<span class="countdown ${extraClass}" data-ends="${endsAt}">${left}</span>`;
  }

  /*
    Bytter innhold i et element bare hvis HTML-en faktisk er endret,
    og tar vare på verdier i input-felt med id (så skriving ikke forsvinner).
  */
  const lastHtml = new WeakMap();
  // Oppdaterer DOM-en på plass i stedet for å bytte den ut, så elementene beholdes.
  function morph(from, to) {
    const oldNodes = [...from.childNodes];
    const newNodes = [...to.childNodes];
    newNodes.forEach((next, i) => {
      const cur = oldNodes[i];
      if (!cur) return from.appendChild(next);
      if (cur.nodeType !== next.nodeType || cur.nodeName !== next.nodeName ||
          (cur.nodeType === 1 && cur.id !== next.id)) {
        return from.replaceChild(next, cur);
      }
      if (cur.nodeType !== 1) {
        if (cur.nodeValue !== next.nodeValue) cur.nodeValue = next.nodeValue;
        return;
      }
      [...cur.attributes].forEach(a => { if (!next.hasAttribute(a.name)) cur.removeAttribute(a.name); });
      [...next.attributes].forEach(a => { if (cur.getAttribute(a.name) !== a.value) cur.setAttribute(a.name, a.value); });
      morph(cur, next);
    });
    oldNodes.slice(newNodes.length).forEach(node => node.remove());
  }

  function render(el, html) {
    if (lastHtml.get(el) === html) return;
    // Skriver noen i et felt her, oppdateres siden på plass så feltet (og tastaturet på mobilen) beholdes.
    const active = document.activeElement;
    if (active && active.matches("input[id], textarea[id]") && el.contains(active)) {
      const next = document.createElement(el.tagName);
      next.innerHTML = html;
      if (next.querySelector(`#${CSS.escape(active.id)}`)) {
        morph(el, next);
        lastHtml.set(el, html);
        return;
      }
    }
    // Husk hvor langt rullbare lister var rullet, så de ikke hopper til toppen når de tegnes på nytt.
    const sameKind = (root, tag, cls) => [...root.getElementsByTagName(tag)].filter(n => n.className === cls);
    const scrolled = [];
    el.querySelectorAll("*").forEach(node => {
      if (node.scrollTop > 0) {
        const tag = node.tagName, cls = node.className;
        scrolled.push({ tag, cls, index: sameKind(el, tag, cls).indexOf(node), top: node.scrollTop });
      }
    });
    const saved = {};
    el.querySelectorAll("input[id]").forEach(input => {
      saved[input.id] = { value: input.value, focused: document.activeElement === input, dirty: input.dataset.dirty };
    });
    const elTop = el.scrollTop;
    el.innerHTML = html;
    lastHtml.set(el, html);
    if (elTop) el.scrollTop = elTop;
    scrolled.forEach(s => {
      const match = sameKind(el, s.tag, s.cls)[s.index];
      if (match) match.scrollTop = s.top;
    });
    Object.entries(saved).forEach(([id, s]) => {
      const input = el.querySelector(`#${CSS.escape(id)}`);
      if (!input || !s.dirty) return;
      input.value = s.value;
      input.dataset.dirty = "1";
      if (s.focused) input.focus();
    });
  }

  // Markerer input som endret av brukeren, så render() ikke overskriver dem.
  document.addEventListener("input", e => {
    if (e.target.matches("input[id]")) e.target.dataset.dirty = "1";
  });

  // ---------- Figurer ----------

  const FIGURE_OPTIONS = {
    color: ["#ff5a5a", "#ff9f40", "#ffd84d", "#5ad16a", "#3fc6e0", "#5a7bff", "#b35aff", "#ff5aa5"],
    body: ["rund", "firkant", "trekant", "blob"],
    eyes: ["glad", "kul", "sint", "søvnig"],
    hat: ["ingen", "lue", "caps", "flosshatt", "sløyfe", "horn"]
  };

  function bodyShape(body, color) {
    const stroke = `stroke="rgba(0,0,0,.35)" stroke-width="3"`;
    switch (body) {
      case "firkant": return `<rect x="22" y="40" width="56" height="62" rx="12" fill="${color}" ${stroke}/>`;
      case "trekant": return `<path d="M50 34 L84 102 Q50 108 16 102 Z" fill="${color}" ${stroke} stroke-linejoin="round"/>`;
      case "blob": return `<path d="M50 36 C78 34 86 60 82 80 C80 100 64 104 50 103 C34 104 18 98 18 78 C16 56 26 38 50 36 Z" fill="${color}" ${stroke}/>`;
      default: return `<circle cx="50" cy="71" r="32" fill="${color}" ${stroke}/>`;
    }
  }

  function eyes(kind) {
    const y = 64;
    switch (kind) {
      case "kul":
        return `<rect x="30" y="${y - 6}" width="17" height="11" rx="4" fill="#111"/><rect x="53" y="${y - 6}" width="17" height="11" rx="4" fill="#111"/><rect x="46" y="${y - 3}" width="8" height="3" fill="#111"/>
          <path d="M40 80 Q50 85 60 80" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case "sint":
        return `<circle cx="40" cy="${y}" r="5" fill="#111"/><circle cx="60" cy="${y}" r="5" fill="#111"/>
          <path d="M32 ${y - 12} L46 ${y - 6} M68 ${y - 12} L54 ${y - 6}" stroke="#111" stroke-width="4" stroke-linecap="round"/>
          <path d="M40 84 Q50 77 60 84" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case "søvnig":
        return `<path d="M34 ${y} Q40 ${y + 5} 46 ${y} M54 ${y} Q60 ${y + 5} 66 ${y}" stroke="#111" stroke-width="3.5" fill="none" stroke-linecap="round"/>
          <ellipse cx="50" cy="82" rx="5" ry="4" fill="#111"/>`;
      default:
        return `<circle cx="40" cy="${y}" r="6" fill="white"/><circle cx="60" cy="${y}" r="6" fill="white"/>
          <circle cx="41" cy="${y + 1}" r="3.2" fill="#111"/><circle cx="61" cy="${y + 1}" r="3.2" fill="#111"/>
          <path d="M38 79 Q50 90 62 79" stroke="#111" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    }
  }

  function hat(kind) {
    switch (kind) {
      case "lue":
        return `<path d="M28 42 Q50 8 72 42 Z" fill="#e8384f" stroke="rgba(0,0,0,.3)" stroke-width="2"/><rect x="25" y="38" width="50" height="9" rx="4" fill="#fff"/><circle cx="50" cy="16" r="6" fill="#fff"/>`;
      case "caps":
        return `<path d="M30 42 Q32 20 52 20 Q70 20 70 42 Z" fill="#2d6cdf"/><path d="M62 40 L90 42 Q88 47 64 46 Z" fill="#1d4fae"/>`;
      case "flosshatt":
        return `<rect x="34" y="6" width="32" height="32" rx="3" fill="#1a1a1a"/><rect x="34" y="28" width="32" height="5" fill="#c0392b"/><rect x="24" y="36" width="52" height="7" rx="3" fill="#1a1a1a"/>`;
      case "sløyfe":
        return `<path d="M50 38 L32 26 L32 48 Z M50 38 L68 26 L68 48 Z" fill="#ff5aa5" stroke="rgba(0,0,0,.3)" stroke-width="2"/><circle cx="50" cy="38" r="5" fill="#d63384"/>`;
      case "horn":
        return `<path d="M34 44 Q24 30 30 18 Q34 32 42 40 Z M66 44 Q76 30 70 18 Q66 32 58 40 Z" fill="#c0392b"/>`;
      default:
        return "";
    }
  }

  function sword(level) {
    if (!level) return "";
    const len = 30 + level * 8;
    return `<g transform="translate(86 92) rotate(-30)">
      <rect x="-3" y="${-len}" width="6" height="${len}" rx="2" fill="#dfe6ee" stroke="#7a8794" stroke-width="1.5"/>
      <rect x="-10" y="-2" width="20" height="5" rx="2" fill="#c49a2c"/>
      <rect x="-2.5" y="3" width="5" height="10" rx="2" fill="#7a4b20"/>
    </g>`;
  }

  function shield(level) {
    if (!level) return "";
    const s = 0.8 + level * 0.15;
    return `<g transform="translate(14 78) scale(${s})">
      <path d="M0 -18 L16 -12 Q16 10 0 20 Q-16 10 -16 -12 Z" fill="#8a96a8" stroke="#3d4757" stroke-width="2.5"/>
      <path d="M0 -11 L0 13 M-9 -2 L9 -2" stroke="#3d4757" stroke-width="2.5"/>
    </g>`;
  }

  function star(level) {
    if (!level) return "";
    let out = "";
    for (let i = 0; i < level; i++) {
      const x = 38 + i * 12 - (level - 1) * 6 + 12;
      out += `<path transform="translate(${x - 12} 96) scale(.55)" d="M12 0 L15 8 L24 8 L17 13 L20 22 L12 17 L4 22 L7 13 L0 8 L9 8 Z" fill="#ffd84d" stroke="#a37a00" stroke-width="1.5"/>`;
    }
    return out;
  }

  function crown() {
    return `<path d="M30 6 L36 -12 L44 2 L50 -16 L56 2 L64 -12 L70 6 Z" fill="#ffd84d" stroke="#a37a00" stroke-width="2" transform="translate(0 2)"/>`;
  }

  // Tegner en figur som SVG. opts: { size, crown }
  function figureSvg(figure, upgrades, opts = {}) {
    figure = figure || {};
    upgrades = upgrades || {};
    const size = opts.size || 80;
    const color = figure.color || FIGURE_OPTIONS.color[0];
    const hatY = figure.body === "trekant" ? -4 : 0;
    return `<svg class="figure-svg" width="${size}" height="${size * 1.2}" viewBox="0 -20 100 132" aria-hidden="true">
      ${shield(upgrades.shield)}
      ${bodyShape(figure.body, color)}
      <g transform="translate(0 ${figure.body === "trekant" ? 8 : 0})">${eyes(figure.eyes)}</g>
      <g transform="translate(0 ${hatY})">${hat(figure.hat)}</g>
      ${sword(upgrades.sword)}
      ${star(upgrades.star)}
      ${opts.crown ? crown() : ""}
    </svg>`;
  }

  // ---------- Former til runde 3 ----------

  const SHAPE_COLORS = { "rød": "#e53935", "blå": "#1e66f5", "grønn": "#2e9e44", "gul": "#f5c400" };

  function shapeSvg(cell) {
    if (!cell) return "";
    const fill = SHAPE_COLORS[cell.c] || "#999";
    let shape;
    switch (cell.s) {
      case "firkant": shape = `<rect x="14" y="14" width="72" height="72" rx="6" fill="${fill}"/>`; break;
      case "sirkel": shape = `<circle cx="50" cy="50" r="38" fill="${fill}"/>`; break;
      case "trekant": shape = `<polygon points="50,10 90,88 10,88" fill="${fill}"/>`; break;
      case "pil": shape = `<polygon points="50,6 90,46 64,46 64,94 36,94 36,46 10,46" fill="${fill}"/>`; break;
      case "halvsirkel": shape = `<path d="M8 72 A42 42 0 0 1 92 72 Z" fill="${fill}"/>`; break;
      default: shape = "";
    }
    return `<svg viewBox="0 0 100 100"><g transform="rotate(${(cell.r || 0) * 90} 50 50)">${shape}</g></svg>`;
  }

  function gridHtml(cells, size, opts = {}) {
    const items = cells.map((cell, i) => {
      const inner = shapeSvg(cell);
      return opts.clickable
        ? `<button class="cell" data-cell="${i}">${inner}</button>`
        : `<div class="cell">${inner}</div>`;
    }).join("");
    return `<div class="grid" style="grid-template-columns: repeat(${size}, 1fr)">${items}</div>`;
  }

  // ---------- Lagring ----------

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key));
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      return null;
    }
  }

  // Felles visninger for nye leker
  function lightsHtml(timing) {
    const lights = Array.from({ length: timing.lights }, () => `<div class="f1-light"></div>`).join("");
    return `<div class="f1-lights" data-lights data-lights-at="${timing.lightsAt}" data-light-ms="${timing.lightMs}" data-out-at="${timing.outAt}">${lights}</div>`;
  }

  function mineHtml(g, cls = "") {
    return `<span class="mine-value ${cls}" data-mine data-start="${g.startedAt}" data-sec-ms="${g.secMs}" data-pps="${g.pps}" data-accel="${g.accel}"></span>`;
  }

  // Deler lenken til et spill. Bruker telefonens delingsmeny hvis den finnes, ellers kopierer lenken.
  async function shareGame(code, button) {
    const url = `${location.origin}/?kode=${encodeURIComponent(code)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Gameshow", text: `Bli med i Gameshow! Koden er ${code}.`, url });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch (e) {
      copied = false;
    }
    if (!copied) {
      window.prompt("Kopier lenken:", url);
      return;
    }
    if (button) {
      const label = button.textContent;
      button.textContent = "Lenke kopiert!";
      setTimeout(() => { button.textContent = label; }, 2000);
    }
  }

  // Tilbakemelding: velg Bugg eller Idé, skriv en melding og send til serveren.
  function openFeedback(context) {
    if (document.querySelector(".feedback-overlay")) return;
    const overlay = document.createElement("div");
    overlay.className = "feedback-overlay";
    overlay.innerHTML = `
      <form class="feedback-box">
        <h2>Tilbakemelding</h2>
        <div class="feedback-kinds">
          <button type="button" class="secondary selected" data-kind="bugg">🐞 Bugg</button>
          <button type="button" class="secondary" data-kind="ide">💡 Idé</button>
        </div>
        <textarea maxlength="2000" rows="5" placeholder="Hva skjedde, eller hva har du lyst på?" required></textarea>
        <p class="feedback-status"></p>
        <div class="feedback-actions">
          <button type="button" class="secondary" data-close>Avbryt</button>
          <button type="submit">Send</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("form");
    const text = overlay.querySelector("textarea");
    const status = overlay.querySelector(".feedback-status");
    const submit = overlay.querySelector("button[type=submit]");
    let kind = "bugg";
    const close = () => overlay.remove();

    overlay.addEventListener("click", event => {
      if (event.target === overlay || event.target.closest("[data-close]")) return close();
      const kindButton = event.target.closest("[data-kind]");
      if (kindButton) {
        kind = kindButton.dataset.kind;
        overlay.querySelectorAll("[data-kind]").forEach(b => b.classList.toggle("selected", b === kindButton));
      }
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const message = text.value.trim();
      if (!message) return;
      submit.disabled = true;
      status.textContent = "";
      try {
        await api("/api/feedback", { kind, message, context: context || location.pathname });
        form.innerHTML = `<h2>Takk!</h2><p>Tilbakemeldingen er sendt.</p><div class="feedback-actions"><button type="button" data-close>Lukk</button></div>`;
      } catch (e) {
        status.textContent = e.message;
        submit.disabled = false;
      }
    });

    text.focus();
  }

  return {
    esc, attr, api, connect, now, startCountdowns, countdown, render, onFrame,
    figureSvg, FIGURE_OPTIONS, shapeSvg, gridHtml, SHAPE_COLORS, store, lightsHtml, mineHtml,
    shareGame, openFeedback
  };
})();

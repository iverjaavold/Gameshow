/*
  Server for Gameshow.
  Serverer appen og kjører spillene. Statiske filer leses og gzippes én gang ved oppstart,
  så start serveren på nytt etter at du har endret HTML/CSS/JS lokalt.

  Sanntid: klientene får tilstand via Server-Sent Events (/api/stream)
  og sender handlinger med POST (/api/action). Ingen avhengigheter å installere.

  Start lokalt:  node server.js   (åpne http://localhost:3000)
*/

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const config = require("./game/config");
const { Game, GameError } = require("./game/game");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const FEEDBACK_FILE = process.env.FEEDBACK_FILE || path.join(ROOT, "tilbakemeldinger.jsonl");
const PUBLIC_PATHS = ["index.html", "host.html", "spill.html", "css/", "js/", "assets/"];
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".svg"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

// Leser alle offentlige filer inn i minnet ved oppstart, ferdig gzippet.
function loadStaticFiles() {
  const files = new Map();

  function addFile(relativePath) {
    const ext = path.extname(relativePath).toLowerCase();
    const raw = fs.readFileSync(path.join(ROOT, relativePath));
    files.set(relativePath, {
      type: MIME_TYPES[ext] || "application/octet-stream",
      raw,
      gzip: COMPRESSIBLE.has(ext) ? zlib.gzipSync(raw, { level: 9 }) : null,
      etag: `"${crypto.createHash("sha1").update(raw).digest("base64url")}"`
    });
  }

  function addDir(dir) {
    if (!fs.existsSync(path.join(ROOT, dir))) return;
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(entry => {
      const relativePath = `${dir}${entry.name}`;
      if (entry.isDirectory()) addDir(`${relativePath}/`);
      else if (entry.name !== ".gitkeep") addFile(relativePath);
    });
  }

  PUBLIC_PATHS.forEach(publicPath => {
    if (publicPath.endsWith("/")) addDir(publicPath);
    else addFile(publicPath);
  });

  return files;
}

const staticFiles = loadStaticFiles();

function serveStatic(req, res, urlPath) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(urlPath).replace(/^\/+/, "") || "index.html";
  } catch (error) {
    res.writeHead(400);
    res.end();
    return;
  }

  const file = staticFiles.get(relativePath);
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Fant ikke siden.");
    return;
  }

  const headers = {
    "Content-Type": file.type,
    "Cache-Control": "no-cache",
    "ETag": file.etag,
    "Vary": "Accept-Encoding"
  };

  if (req.headers["if-none-match"] === file.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  const useGzip = file.gzip && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  if (useGzip) headers["Content-Encoding"] = "gzip";

  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : (useGzip ? file.gzip : file.raw));
}

// ---------- Spill ----------

const games = new Map(); // kode -> Game

function newCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < config.CODE_LENGTH; i++) {
      code += config.CODE_ALPHABET[crypto.randomInt(config.CODE_ALPHABET.length)];
    }
    if (!games.has(code)) return code;
  }
}

function findGame(code) {
  return games.get(String(code || "").trim().toUpperCase());
}

// Rydder bort gamle spill.
setInterval(() => {
  const now = Date.now();
  games.forEach((game, code) => {
    if (now - game.lastActivity > config.GAME_IDLE_TIMEOUT_MS) {
      game.destroy();
      games.delete(code);
    }
  });
}, 10 * 60 * 1000).unref();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 32 * 1024) {
        reject(new GameError("For stor forespørsel."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (error) {
        reject(new GameError("Ugyldig forespørsel."));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, pathname, query) {
  if (pathname === "/api/stream") return openStream(req, res, query);
  if (req.method !== "POST") return sendJson(res, 405, { error: "Bruk POST." });

  const body = await readBody(req);

  if (pathname === "/api/create") {
    const code = newCode();
    const game = new Game(code);
    games.set(code, game);
    return sendJson(res, 200, { code, hostToken: game.hostToken });
  }

  if (pathname === "/api/feedback") {
    const kind = body.kind === "ide" ? "ide" : "bugg";
    const message = String(body.message || "").trim().slice(0, 2000);
    if (!message) throw new GameError("Skriv en melding først.");
    const entry = { at: new Date().toISOString(), kind, message, context: String(body.context || "").slice(0, 100) };
    console.log(`[tilbakemelding] ${JSON.stringify(entry)}`);
    fs.appendFile(FEEDBACK_FILE, `${JSON.stringify(entry)}\n`, error => {
      if (error) console.error("Kunne ikke lagre tilbakemelding:", error.message);
    });
    return sendJson(res, 200, { ok: true });
  }

  const game = findGame(body.code);
  if (!game) throw new GameError("Fant ikke spillet. Sjekk koden.");

  if (pathname === "/api/check") {
    const player = body.token ? game.playerByToken(body.token) : null;
    return sendJson(res, 200, { ok: true, joinOpen: game.joinOpen, isPlayer: !!player, isHost: body.token === game.hostToken });
  }

  if (pathname === "/api/join") {
    const player = game.join(body.name, body.figure);
    return sendJson(res, 200, { token: player.token, code: game.code });
  }

  if (pathname === "/api/action") {
    const type = String(body.type || "");
    const data = body.data || {};
    if (body.token === game.hostToken) {
      game.hostAction(type, data);
    } else {
      const player = game.playerByToken(body.token);
      if (!player) throw new GameError("Du er ikke med i dette spillet.");
      game.playerAction(player, type, data);
    }
    game.changed();
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: "Ukjent adresse." });
}

function openStream(req, res, query) {
  const game = findGame(query.get("code"));
  const t = query.get("token");
  if (!game) return sendJson(res, 404, { error: "Fant ikke spillet." });

  let listener;
  if (t === game.hostToken) {
    listener = { res, role: "host" };
  } else {
    const player = game.playerByToken(t);
    if (!player) return sendJson(res, 403, { error: "Ukjent spiller." });
    listener = { res, role: "player", playerId: player.id };
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write("retry: 2000\n\n");

  const heartbeat = setInterval(() => res.write(": ping\n\n"), config.HEARTBEAT_MS);
  game.addListener(listener);
  req.on("close", () => {
    clearInterval(heartbeat);
    game.removeListener(listener);
  });
}

const server = http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, "http://localhost");

  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (pathname === "/api/time") {
    sendJson(res, 200, { now: Date.now() });
    return;
  }

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname, searchParams).catch(error => {
      if (error instanceof GameError) {
        sendJson(res, 400, { error: error.message });
      } else {
        console.error(error);
        sendJson(res, 500, { error: "Noe gikk galt på serveren." });
      }
    });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Gameshow kjører på http://localhost:${PORT}`);
});

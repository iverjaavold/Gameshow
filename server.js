/*
  Server for Gameshow.
  Serverer appen. Statiske filer leses og gzippes én gang ved oppstart,
  så start serveren på nytt etter at du har endret HTML/CSS/JS lokalt.

  Start lokalt:  node server.js   (åpne http://localhost:3000)
*/

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_PATHS = ["index.html", "css/", "js/", "assets/"];
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
  ".ico": "image/x-icon"
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

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (pathname === "/api/time") {
    sendJson(res, 200, { now: Date.now() });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Gameshow kjører på http://localhost:${PORT}`);
});

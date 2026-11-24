// Server delle board: serve l'interfaccia (dist/), la sincronizzazione in tempo reale (WebSocket) e il caricamento delle immagini.
//   GET  /b/<board>?t=<token>            interfaccia (le pagine sono sempre index.html)
//   WS   /connect/<board>?t=<token>      sincronizzazione (token verificato; "viewer" = sola lettura)
//   PUT  /api/uploads/<board>/<file>?t=  carica un'immagine (solo "editor")
//   GET  /api/uploads/<board>/<file>     scarica (il nome del file contiene un codice casuale)
//   GET  /health
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { WebSocketServer } from "ws";
import { ROOM_ID, verifyToken } from "./auth.ts";
import { closeAllRooms, getRoom, openRooms, roomDir } from "./rooms.ts";

// In locale le variabili si possono tenere nel file .env (in Docker le passa il compose)
try {
  process.loadEnvFile(".env");
} catch {
  /* nessun file .env */
}

const PORT = Number(process.env.PORT) || 3030;
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || "./dist");
const MAX_UPLOAD = (Number(process.env.MAX_UPLOAD_MB) || 25) * 1024 * 1024;

let SECRET = process.env.BOARD_SECRET || "";
if (!SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("BOARD_SECRET mancante: impostalo (stringa lunga e casuale) nelle variabili d'ambiente.");
    process.exit(1);
  }
  SECRET = "dev-secret-solo-per-prove";
  console.warn("BOARD_SECRET non impostato: uso un valore di prova (solo sviluppo).");
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf", ".map": "application/json",
};
// tipi di file accettati come allegati alle board (niente HTML/SVG/script: si servono con questo elenco, non da quello che dichiara il client)
const UPLOAD_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".webm", ".pdf"]);

const send = (res: http.ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
  res.end(body);
};

/** Percorso file sicuro dentro `base` (niente "..", niente nomi nascosti). */
function safeJoin(base: string, ...parts: string[]) {
  const p = path.resolve(base, ...parts);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

function serveFile(res: http.ServerResponse, file: string, cache: string) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "Non trovato");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  try {
    if (url.pathname === "/health") return send(res, 200, JSON.stringify({ ok: true, rooms: openRooms() }), "application/json");

    // --- allegati ---
    const up = /^\/api\/uploads\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (up) {
      const [room, name] = [decodeURIComponent(up[1]), decodeURIComponent(up[2])];
      const ext = path.extname(name).toLowerCase();
      if (!ROOM_ID.test(room) || !/^[\w.\- ()]{1,150}$/.test(name) || name.startsWith(".") || !UPLOAD_EXT.has(ext)) return send(res, 400, "Nome o tipo di file non valido");
      const dir = path.join(roomDir(DATA_DIR, room), "assets");
      const file = safeJoin(dir, name);
      if (!file) return send(res, 400, "Nome non valido");
      if (req.method === "GET") return serveFile(res, file, "public, max-age=31536000, immutable");
      if (req.method === "PUT") {
        const t = verifyToken(url.searchParams.get("t"), SECRET);
        if (!t || t.room !== room || t.role !== "editor") return send(res, 403, "Non autorizzato");
        if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, "File troppo grande");
        fs.mkdirSync(dir, { recursive: true });
        if (fs.existsSync(file)) return send(res, 200, "{}", "application/json");
        const tmp = `${file}.${process.pid}.part`;
        let size = 0;
        req.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_UPLOAD) req.destroy();
        });
        try {
          await pipeline(req, fs.createWriteStream(tmp));
          fs.renameSync(tmp, file);
        } catch {
          fs.rmSync(tmp, { force: true });
          return send(res, 413, "File troppo grande o interrotto");
        }
        return send(res, 200, "{}", "application/json");
      }
      return send(res, 405, "Metodo non consentito");
    }

    // --- interfaccia ---
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Metodo non consentito");
    const asset = url.pathname === "/" ? null : safeJoin(PUBLIC_DIR, "." + decodeURIComponent(url.pathname));
    if (asset && fs.existsSync(asset) && fs.statSync(asset).isFile()) {
      return serveFile(res, asset, url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
    }
    return serveFile(res, path.join(PUBLIC_DIR, "index.html"), "no-cache"); // /b/<board> e la pagina iniziale
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, "Errore interno");
  }
});

// --- sincronizzazione in tempo reale ---
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", "http://x");
  const m = /^\/connect\/([^/]+)$/.exec(url.pathname);
  const room = m ? decodeURIComponent(m[1]) : "";
  const t = verifyToken(url.searchParams.get("t"), SECRET);
  const sessionId = url.searchParams.get("sessionId") || "";
  if (!m || !t || t.room !== room || !ROOM_ID.test(room) || !/^[\w-]{1,100}$/.test(sessionId)) {
    console.warn(`WebSocket rifiutato: ${url.pathname} (token ${t ? "ok" : "non valido"}, sessione "${sessionId.slice(0, 30)}")`);
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    try {
      getRoom(DATA_DIR, room).handleSocketConnect({ sessionId, socket: ws, isReadonly: t.role === "viewer" });
      if (process.env.DEBUG_BOARD) console.log(`connesso ${t.name} (${t.role}) a ${room}`);
    } catch (e) {
      console.error("Errore nella connessione alla stanza:", e);
      ws.close(1011, "errore interno");
    }
    ws.on("close", (code, reason) => process.env.DEBUG_BOARD && console.log(`chiuso ${sessionId.slice(-6)} codice ${code} ${reason}`));
    ws.on("error", (e) => console.error("WebSocket:", e.message));
  });
});

server.listen(PORT, () => console.log(`Board in ascolto su http://localhost:${PORT} (dati in ${DATA_DIR})`));

const stop = () => {
  closeAllRooms();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

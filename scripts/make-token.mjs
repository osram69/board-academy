#!/usr/bin/env node
// Crea il link d'accesso a una board (per le prove; il sito Cube Academy farà lo stesso con la stessa firma).
//   npm run token -- <board> "<nome>" <editor|viewer> [ore] [indirizzo] [id-utente]
//   npm run token -- cpsaf-dic26 "Patrick Serra" editor 12 http://localhost:5173
// Usa BOARD_SECRET dall'ambiente o dal file .env (come il server).
import crypto from "node:crypto";
import fs from "node:fs";

if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const [room, name = "Ospite", role = "editor", hours = "12", base = "http://localhost:3030", uid] = process.argv.slice(2);
if (!room || !/^[A-Za-z0-9_-]{1,64}$/.test(room) || !["editor", "viewer"].includes(role)) {
  console.error('Uso: npm run token -- <board> "<nome>" <editor|viewer> [ore] [indirizzo]\nboard: lettere, numeri, - e _ (max 64)');
  process.exit(1);
}
const secret = process.env.BOARD_SECRET || "dev-secret-solo-per-prove";
const body = Buffer.from(JSON.stringify({ room, name, uid, role, exp: Date.now() + Number(hours) * 3600e3 })).toString("base64url");
const sig = crypto.createHmac("sha256", secret).update(`board:${body}`).digest("base64url");
console.log(`${base.replace(/\/$/, "")}/b/${room}?t=${body}.${sig}`);

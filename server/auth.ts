// Accesso alle board: il sito Cube Academy (o lo script `npm run token`) emette un token firmato con BOARD_SECRET.
// Il token dice QUALE board, CHI è l'utente e COSA può fare ("editor" modifica, "viewer" guarda). Il server lo verifica
// a ogni connessione WebSocket e a ogni upload: nessun account da gestire qui.
import crypto from "node:crypto";

export type Role = "editor" | "viewer";
export interface TokenPayload {
  room: string; // identificativo della board
  name: string; // nome mostrato accanto al cursore
  uid?: string; // identificativo stabile dell'utente (es. il nome utente sul sito): serve ad attribuire ciò che disegna
  role: Role;
  exp: number; // scadenza, ms epoch
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const mac = (secret: string, body: string) => crypto.createHmac("sha256", secret).update(`board:${body}`).digest("base64url");

export const ROOM_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export function signToken(p: TokenPayload, secret: string): string {
  const body = b64(JSON.stringify(p));
  return `${body}.${mac(secret, body)}`;
}

export function verifyToken(token: string | null | undefined, secret: string): TokenPayload | null {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const good = mac(secret, body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (!ROOM_ID.test(p.room) || (p.role !== "editor" && p.role !== "viewer") || !(p.exp > Date.now())) return null;
    const uid = typeof p.uid === "string" && /^[\w.@-]{1,64}$/.test(p.uid) ? p.uid : undefined;
    return { room: p.room, name: String(p.name || "Ospite").slice(0, 60), uid, role: p.role, exp: p.exp };
  } catch {
    return null;
  }
}

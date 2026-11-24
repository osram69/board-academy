// Il token d'accesso arriva nell'indirizzo (?t=…), viene tenuto nella sessione del browser e tolto dall'indirizzo visibile.
// Qui si legge solo per mostrare nome e ruolo: i permessi veri li controlla il server.
export interface BoardSession {
  room: string;
  token: string;
  name: string;
  uid?: string;
  role: "editor" | "viewer";
  exp: number;
}

const KEY = (room: string) => `board:token:${room}`;

export function roomFromPath(): string | null {
  const m = /^\/b\/([A-Za-z0-9_-]{1,64})\/?$/.exec(location.pathname);
  return m ? m[1] : null;
}

function decode(token: string): { room: string; name: string; uid?: string; role: "editor" | "viewer"; exp: number } | null {
  try {
    const body = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(body))); // UTF-8 (nomi con accenti)
    const p = JSON.parse(json);
    return p && typeof p.room === "string" ? p : null;
  } catch {
    return null;
  }
}

export function loadSession(room: string): BoardSession | null {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get("t");
  let token = fromUrl;
  try {
    if (fromUrl) {
      sessionStorage.setItem(KEY(room), fromUrl);
      url.searchParams.delete("t");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } else {
      token = sessionStorage.getItem(KEY(room));
    }
  } catch {
    /* sessionStorage non disponibile: vale solo il token nell'indirizzo */
  }
  if (!token) return null;
  const p = decode(token);
  if (!p || p.room !== room || !(p.exp > Date.now())) return null;
  return { room, token, name: p.name || "Ospite", uid: typeof p.uid === "string" ? p.uid : undefined, role: p.role === "viewer" ? "viewer" : "editor", exp: p.exp };
}

/** Identificativo stabile di questo browser, per attribuire ciò che si disegna. */
export function browserId(): string {
  try {
    let id = localStorage.getItem("board:uid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("board:uid", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const COLORS = ["#e8321e", "#ff6a45", "#177a4b", "#a9760a", "#5e1220", "#2563eb", "#7c3aed", "#0d9488"];
export const colorFor = (name: string) => COLORS[[...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

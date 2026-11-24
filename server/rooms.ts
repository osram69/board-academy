// Una "stanza" per board: documento condiviso in memoria + salvataggio su SQLite (DATA_DIR/rooms/<id>/board.db).
// Quando l'ultimo partecipante esce, dopo un minuto la stanza viene chiusa e la memoria liberata:
// alla prossima apertura il documento si ricarica dal disco.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom } from "@tldraw/sync-core";

interface Entry {
  room: TLSocketRoom<any, void>;
  db: DatabaseSync;
  closeTimer?: NodeJS.Timeout;
}

const rooms = new Map<string, Entry>();
const IDLE_CLOSE_MS = 60_000;

export const roomDir = (dataDir: string, roomId: string) => path.join(dataDir, "rooms", roomId);

export function getRoom(dataDir: string, roomId: string): TLSocketRoom<any, void> {
  const existing = rooms.get(roomId);
  if (existing) {
    clearTimeout(existing.closeTimer);
    existing.closeTimer = undefined;
    return existing.room;
  }
  fs.mkdirSync(roomDir(dataDir, roomId), { recursive: true });
  const db = new DatabaseSync(path.join(roomDir(dataDir, roomId), "board.db"));
  db.exec("PRAGMA journal_mode = WAL");
  const storage = new SQLiteSyncStorage({ sql: new NodeSqliteWrapper(db) });
  const room = new TLSocketRoom<any, void>({
    storage,
    onSessionRemoved(_room, { numSessionsRemaining }) {
      if (numSessionsRemaining > 0) return;
      const e = rooms.get(roomId);
      if (!e) return;
      e.closeTimer = setTimeout(() => {
        if (room.getNumActiveSessions() > 0) return;
        rooms.delete(roomId);
        room.close();
        db.close();
      }, IDLE_CLOSE_MS);
    },
  });
  rooms.set(roomId, { room, db });
  return room;
}

export const openRooms = () => rooms.size;

/** Chiude tutto in modo ordinato (arresto del server). */
export function closeAllRooms() {
  for (const [id, e] of rooms) {
    clearTimeout(e.closeTimer);
    e.room.close();
    e.db.close();
    rooms.delete(id);
  }
}

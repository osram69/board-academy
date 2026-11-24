import { useCallback, useMemo } from "react";
import { Tldraw, computed, createUserId, UserRecordType, type Editor, type TLAssetStore, type TLUserStore } from "tldraw";
import { useSync } from "@tldraw/sync";
import "tldraw/tldraw.css";
import { browserId, colorFor, type BoardSession } from "./session";

const LICENSE = import.meta.env.VITE_TLDRAW_LICENSE_KEY as string | undefined;

export function Board({ session }: { session: BoardSession }) {
  const { room, token, name, role, uid } = session;

  // allegati (immagini, video, PDF) sul nostro server invece che incorporati nel documento
  const assets = useMemo<TLAssetStore>(
    () => ({
      async upload(_asset, file) {
        const safe = file.name.replace(/[^\w.\- ()]+/g, "_").slice(-100);
        const id = `${crypto.randomUUID()}-${safe}`;
        const r = await fetch(`/api/uploads/${room}/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`, { method: "PUT", body: file });
        if (!r.ok) throw new Error(r.status === 413 ? "File troppo grande" : "Caricamento non riuscito");
        return { src: `${location.origin}/api/uploads/${room}/${encodeURIComponent(id)}` };
      },
      resolve: (asset) => asset.props.src,
    }),
    [room, token]
  );

  // identità dell'utente: nome e colore del cursore
  const users = useMemo<TLUserStore>(() => {
    const me = computed("me", () => UserRecordType.create({ id: createUserId(uid ?? browserId()), name, color: colorFor(name), imageUrl: "", meta: {} }));
    return { currentUser: me };
  }, [name, uid]);

  // useSync riapre la connessione se cambia l'identità di questa funzione: deve restare la stessa tra un render e l'altro
  const uri = useCallback(
    () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/connect/${room}?t=${encodeURIComponent(token)}`,
    [room, token]
  );
  const store = useSync({ uri, assets, users });

  const onMount = (editor: Editor) => {
    editor.user.updateUserPreferences({ locale: "it", name, color: colorFor(name) });
    if (role === "viewer") editor.updateInstanceState({ isReadonly: true });
  };

  const status = store.status === "error" ? "errore" : store.status === "loading" ? "connessione…" : store.connectionStatus === "offline" ? "offline" : "in linea";

  return (
    <div className="board-root">
      <header className="board-bar">
        <div className="board-brand">
          <img src="/favicon.png" alt="" width={24} height={24} />
          <b>Cube <span>Academy</span></b>
          <span className="board-room">Board · {room}</span>
        </div>
        <div className="board-meta">
          <span className={`chip chip-${status === "in linea" ? "ok" : status === "errore" || status === "offline" ? "bad" : "wait"}`}>{status}</span>
          {role === "viewer" && <span className="chip">sola lettura</span>}
          <span className="board-user" style={{ ["--c" as string]: colorFor(name) }}>{name}</span>
        </div>
      </header>
      <div className="board-canvas">
        {store.status === "error" ? (
          <div className="board-msg">Non riesco a collegarmi alla board. Ricarica la pagina o apri di nuovo il link ricevuto.</div>
        ) : (
          <Tldraw store={store} licenseKey={LICENSE} onMount={onMount} />
        )}
      </div>
    </div>
  );
}

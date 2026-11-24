# Board Cube Academy

Lavagna collaborativa per i corsi (infinita, note adesive, frecce, forme, testo, immagini, cursori in tempo reale),
costruita su [tldraw](https://tldraw.dev) con un server di sincronizzazione nostro.

```
 browser ──https──> Cloudflare Tunnel ──> container "board" (Node)
                                            ├─ interfaccia (dist/)
                                            ├─ WebSocket /connect/<board>   sincronizzazione
                                            ├─ /api/uploads/…               immagini e allegati
                                            └─ /data  (SQLite per board + allegati)
```

- **Un solo container**: serve interfaccia, tempo reale e allegati. Nessun database esterno: ogni board è un file SQLite in `data/rooms/<board>/`.
- **Nessun account qui**: l'accesso è un *link firmato* emesso dal sito Cube Academy (o da `npm run token`). Il link dice quale board,
  chi è l'utente e se può modificare (`editor`) o solo guardare (`viewer`). Il server verifica la firma a ogni connessione.

## Provarla in locale

```powershell
npm install
npm run dev                    # server (3030) + interfaccia con ricarica automatica (5173)
npm run token -- cpsaf-prova "Mario Rossi" editor 12 http://localhost:5173
npm run token -- cpsaf-prova "Studente" viewer 12 http://localhost:5173 studente1
```

Apri i link stampati in due browser (anche in finestre diverse): vedrai cursori e modifiche dell'altro in tempo reale.
Senza `BOARD_SECRET` in sviluppo si usa un valore di prova; in produzione il server non parte senza.

Versione "di produzione" in locale: `npm run build` e poi `npm start` (tutto su `http://localhost:3030`).

## Mettere online sul Raspberry (Docker)

1. Sul Raspberry (Raspberry Pi OS a 64 bit, Docker già presente): clona il repository e copia `.env.example` in `.env`.
2. In `.env` imposta `BOARD_SECRET` (stringa lunga e casuale; la stessa andrà sul sito).
3. Prepara la cartella dati (il container gira come utente `node`, uid 1000): `mkdir data && sudo chown 1000:1000 data`.
4. `docker compose up -d --build` (la prima volta compila l'interfaccia: qualche minuto sul Pi 4).
5. **Tunnel Cloudflare**: in Cloudflare Zero Trust → Networks → Tunnels crea un tunnel, aggiungi un *Public hostname*
   (es. `board.cubeacademy.eu`) con servizio `http://board:3030`, copia il token in `TUNNEL_TOKEN` nel `.env` e avvia con
   `docker compose --profile tunnel up -d`. Il tunnel esce soltanto verso Cloudflare: non servono porte aperte sul router,
   e vede solo il container della board (rete Docker dedicata), non Home Assistant né Jellyfin.

Il compose limita il container a 2 CPU e 768 MB per non togliere risorse agli altri servizi.
Aggiornare: `git pull && docker compose up -d --build`. I dati restano in `data/` (fai una copia di quella cartella per il backup).

## Integrazione con il sito Cube Academy

Il sito emette il link con la stessa firma di `server/auth.ts` (stesso `BOARD_SECRET`). In Node/Next.js:

```js
import crypto from "node:crypto";
function boardLink(room, { name, uid, role = "viewer", hours = 12 }) {
  const body = Buffer.from(JSON.stringify({ room, name, uid, role, exp: Date.now() + hours * 3600e3 })).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.BOARD_SECRET).update(`board:${body}`).digest("base64url");
  return `https://board.cubeacademy.eu/b/${room}?t=${body}.${sig}`;
}
```

Il pulsante "Apri la board" nell'area `/materiali` (studenti `viewer` o `editor` a scelta, trainer `editor`) genera il link per l'utente connesso.
`uid` è il nome utente sul sito: serve ad attribuire le note a chi le ha scritte. L'id della board: lettere, numeri, `-` e `_` (max 64).

## Sicurezza, in breve

- Link firmati (HMAC-SHA256) con scadenza; il `viewer` ha il server in sola lettura (non basta nascondere gli strumenti).
- Il token viene tolto dall'indirizzo visibile e tenuto nella sessione del browser.
- Allegati: solo immagini, video e PDF (niente HTML/SVG), limite `MAX_UPLOAD_MB`, nomi con codice casuale; si caricano solo con un link `editor`.
- I file di una board si leggono conoscendo l'indirizzo esatto (codice casuale nel nome), come un link condiviso.

## Licenza di tldraw

In sviluppo tldraw è libero; **in produzione serve una licenza** (c'è una prova gratuita di 100 giorni; senza chiave l'editor mostra
una filigrana e poi smette di funzionare). La chiave si mette in `VITE_TLDRAW_LICENSE_KEY` nel `.env` e vale per i domini indicati.
Vedi <https://tldraw.dev/sdk-features/license-key>.

## Da fare / idee

- Pulsante "Apri la board" sul sito e creazione delle board dal pannello admin.
- Template per i corsi (canvas di architettura, retrospettive…), timer e votazioni.
- Esportazione in PNG/PDF a corso finito e archiviazione delle board vecchie.

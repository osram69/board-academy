import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "./Board";
import { loadSession, roomFromPath } from "./session";
import "./styles.css";

function Page() {
  const room = roomFromPath();
  if (!room) {
    return (
      <div className="board-msg">
        <h1>Board Cube Academy</h1>
        <p>Apri la board dal link che ti ha inviato il tuo trainer.</p>
      </div>
    );
  }
  const session = loadSession(room);
  if (!session) {
    return (
      <div className="board-msg">
        <h1>Link non valido o scaduto</h1>
        <p>Riapri la board dal link ricevuto, oppure chiedine uno nuovo al tuo trainer.</p>
      </div>
    );
  }
  return <Board session={session} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>
);

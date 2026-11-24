import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In sviluppo Vite (5173) inoltra WebSocket e API al server di sincronizzazione (3030).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/connect": { target: "ws://localhost:3030", ws: true },
      "/api": "http://localhost:3030",
    },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 4000 },
});

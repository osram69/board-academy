# Immagine multi-architettura (funziona su Raspberry Pi 4/5 a 64 bit e su PC/VPS): la si costruisce direttamente sul Raspberry.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# La chiave di licenza di tldraw entra nell'interfaccia al momento della build (vuota = versione di prova con filigrana)
ARG VITE_TLDRAW_LICENSE_KEY=""
ENV VITE_TLDRAW_LICENSE_KEY=$VITE_TLDRAW_LICENSE_KEY
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production PORT=3030 DATA_DIR=/data PUBLIC_DIR=/app/dist
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY tsconfig.json ./
# i dati (board, immagini) stanno nel volume /data, fuori dall'immagine
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3030
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://localhost:3030/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server/index.ts"]

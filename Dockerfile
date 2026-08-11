# CRM IA (Agentise WhatsApp Hub) — self-host image
# Build combinado: frontend Vite (dist/) + API Express (server.mjs + api-compiled/)
# As credenciais Supabase do frontend (VITE_*) são embutidas no build (Vite as
# resolve em compile-time); as credenciais de servidor (service role, crypto
# key) chegam via env var em runtime — nunca ficam na imagem.

FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV SUPABASE_URL=$VITE_SUPABASE_URL
ENV SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm run build:api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3060

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api-compiled ./api-compiled

EXPOSE 3060
CMD ["node", "server.mjs"]

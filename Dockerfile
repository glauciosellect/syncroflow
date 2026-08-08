FROM node:22-alpine

# Cache-bust: força o EasyPanel a reconstruir a imagem do zero em vez de
# reaproveitar a camada antiga com node:20-alpine (causou crash em produção
# por incompatibilidade com @supabase/supabase-js, que exige WebSocket nativo).
ARG CACHE_BUST=2026-08-07-node22

RUN apk add --no-cache openssl ffmpeg

WORKDIR /app/apps/api

# Copia só a pasta da API
COPY apps/api/package*.json ./
COPY apps/api/prisma ./prisma/
COPY apps/api/src ./src/
COPY apps/api/tsconfig.json ./

# Instala dependências
RUN npm install

# Gera o Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss && node dist/index.js"]

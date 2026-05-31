FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Copia tudo (contexto é a raiz do repo)
COPY . .

# Instala dependências da API
RUN cd apps/api && npm install

# Gera o Prisma Client com caminho absoluto
RUN cd apps/api && npx prisma generate --schema=./prisma/schema.prisma

# Build TypeScript
RUN cd apps/api && npm run build

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/index.js"]

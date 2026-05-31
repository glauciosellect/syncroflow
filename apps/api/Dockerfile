FROM node:20-alpine

WORKDIR /app

# Copia arquivos de dependências
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/ ./packages/

# Instala dependências
RUN npm install --workspace=apps/api --include-workspace-root

# Copia o código da API
COPY apps/api ./apps/api

# Gera o Prisma Client
RUN cd apps/api && npx prisma generate

# Build TypeScript
RUN cd apps/api && npm run build

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/index.js"]

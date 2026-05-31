FROM node:20-alpine

WORKDIR /app

# Copia tudo do repositório
COPY . .

# Instala dependências da API
RUN cd apps/api && npm install

# Gera o Prisma Client
RUN cd apps/api && npx prisma generate

# Build TypeScript
RUN cd apps/api && npm run build

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/index.js"]

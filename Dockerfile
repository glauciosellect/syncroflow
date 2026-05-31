FROM node:20-alpine

RUN apk add --no-cache openssl

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

CMD ["node", "dist/index.js"]

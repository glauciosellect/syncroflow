FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Copia tudo
COPY . .

# Instala dependências
RUN npm install

# Gera o Prisma Client (schema está em ./prisma/schema.prisma)
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build TypeScript
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]

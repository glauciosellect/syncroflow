FROM node:20-alpine

WORKDIR /app

# Copia tudo
COPY . .

# Instala dependências
RUN npm install

# Gera o Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]

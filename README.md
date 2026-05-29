# SyncroFlow

Plataforma SaaS brasileira de atendimento omnichannel com agentes de IA.

## Stack

- **Backend**: Node.js 20 + TypeScript + Fastify + Prisma + PostgreSQL (pgvector) + BullMQ + Redis
- **Frontend**: Next.js 14 + shadcn/ui + Tailwind CSS + Zustand + React Query
- **IA**: Anthropic Claude (padrão) + OpenAI GPT-4 (suporte multi-modelo)
- **Canais**: WhatsApp (Evolution API / Z-API), Instagram, Facebook, Telegram, Widget

## Início rápido

```bash
# 1. Subir banco e Redis
docker-compose up -d

# 2. Configurar backend
cd apps/api
cp .env.example .env
# editar .env com suas credenciais

# 3. Gerar cliente Prisma e rodar migrations
npx prisma generate
npx prisma migrate dev

# 4. Configurar frontend
cd apps/web
cp .env.example .env.local

# 5. Instalar dependências (na raiz)
cd ../..
npm install

# 6. Rodar em desenvolvimento
npm run dev
```

## Variáveis de ambiente obrigatórias (API)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | URL PostgreSQL |
| `REDIS_URL` | URL Redis |
| `JWT_SECRET` | Secret JWT access token |
| `ENCRYPTION_KEY` | Chave AES-256 (64 chars hex) |
| `ANTHROPIC_API_KEY` | Chave API Anthropic (Claude) |
| `OPENAI_API_KEY` | Chave API OpenAI (embeddings) |

## Estrutura

```
syncroflow/
├── apps/
│   ├── api/         # Backend Fastify
│   └── web/         # Frontend Next.js
├── packages/
│   ├── shared/      # Tipos TypeScript compartilhados
│   └── widget/      # Widget de chat para sites
└── docker-compose.yml
```

## Deploy

- **Backend**: Railway ou Fly.io (`apps/api`)
- **Frontend**: Vercel (`apps/web`)
- **Banco**: Supabase (PostgreSQL + pgvector)
- **Redis**: Upstash Redis
- **WhatsApp**: Evolution API (self-hosted no Railway)

## Widget para sites

```html
<script src="https://cdn.syncroflow.com/widget.js"></script>
<script>
  SyncroFlow({
    channelId: "seu-channel-id",
    apiUrl: "https://api.syncroflow.com",
    color: "#6366f1",
    welcomeMessage: "Olá! Como posso ajudar?"
  });
</script>
```

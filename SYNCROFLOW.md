# SyncroFlow — Especificação Completa do Projeto
> Plataforma de Atendimento Omnichannel com IA — Documento para Claude Code

---

## 0. Contexto e Visão Geral

**SyncroFlow** é uma plataforma SaaS brasileira de atendimento omnichannel com agentes de IA. Permite que qualquer empresa crie, treine e gerencie assistentes virtuais inteligentes que atendem clientes pelo WhatsApp, Instagram, Facebook, Telegram e widget de site — sem precisar de código.

O diferencial do SyncroFlow em relação a concorrentes como GPTMaker é:
- **Multi-modelo**: usuário escolhe qual LLM usar por agente (Claude, GPT-4, Gemini, etc.)
- **Base de conhecimento compartilhada**: uma base pode ser usada por múltiplos agentes
- **Intenções com webhook full**: coleta dados do cliente + dispara API externa + persiste variáveis
- **Servidores MCP nativos**: agente pode se conectar a ferramentas externas via MCP
- **Analytics avançado**: custo por atendimento, timeline de consumo, top canais, exportação CSV
- **Variáveis de ambiente seguras**: armazenam credenciais sem expor no código
- **Planos flexíveis**: mensal, trimestral, semestral, anual com descontos progressivos

---

## 1. Stack Tecnológica

### Backend
```
- Runtime: Node.js 20+ com TypeScript
- Framework: Fastify (mais rápido que Express, ideal para APIs de alta concorrência)
- ORM: Prisma
- Banco de dados: PostgreSQL (via Supabase)
- Banco vetorial: pgvector (extensão do Supabase, para RAG)
- Fila de mensagens: BullMQ + Redis
- Autenticação: JWT (access token 15min + refresh token 7 dias) + 2FA (TOTP)
- LLM: Anthropic SDK (Claude) como padrão, com abstração para trocar de modelo
- Embeddings: text-embedding-3-small (OpenAI) ou equivalent
- Armazenamento de arquivos: Supabase Storage
- WebSocket: para chat em tempo real no painel (Socket.io)
```

### Frontend
```
- Framework: Next.js 14+ com App Router
- UI: shadcn/ui + Tailwind CSS
- Estado global: Zustand
- Formulários: React Hook Form + Zod
- Gráficos: Recharts
- Ícones: Lucide React
- Datas: date-fns
- HTTP client: Axios + React Query (TanStack Query)
```

### Infraestrutura
```
- Hospedagem backend: Railway ou Fly.io
- Hospedagem frontend: Vercel
- Banco: Supabase (PostgreSQL + pgvector + Storage + Auth)
- Redis: Upstash Redis
- WhatsApp: Evolution API (self-hosted no Railway)
- Meta (IG + FB): Meta Graph API (webhook oficial)
- Monitoramento: Sentry (erros) + Logflare (logs)
```

### Integrações externas por canal
```
- WhatsApp: Evolution API v2 (open source, auto-hospedada)
- Instagram DM: Meta Graph API (webhook)
- Facebook Messenger: Meta Graph API (webhook)
- Telegram: Telegram Bot API (gratuita)
- Widget de site: iframe ou script injetável (self-hosted)
- ElevenLabs: para respostas em voz
- Google Calendar: para agendamentos
- Shopify: catálogo de produtos
- Stripe / Paypal: links de pagamento
- Zapier / n8n: automações externas via webhook
- Notion: documentos e bases de conhecimento
```

---

## 2. Estrutura de Pastas do Projeto

```
syncroflow/
├── apps/
│   ├── web/                          # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/               # Login, registro, recuperação de senha
│   │   │   ├── (onboarding)/         # Wizard de onboarding pós-cadastro
│   │   │   ├── (dashboard)/          # Área logada principal
│   │   │   │   ├── dashboard/        # Página de dashboards
│   │   │   │   ├── agents/           # Lista e criação de agentes
│   │   │   │   ├── agents/[id]/      # Detalhe do agente (perfil, treinamento, etc.)
│   │   │   │   ├── team/             # Gerenciar equipe humana
│   │   │   │   ├── channels/         # Canais de atendimento (global)
│   │   │   │   ├── chat/             # Inbox de moderação ao vivo
│   │   │   │   ├── contacts/         # CRM de contatos
│   │   │   │   ├── knowledge/        # Bases de conhecimento globais
│   │   │   │   ├── attendances/      # Histórico de atendimentos
│   │   │   │   ├── billing/          # Planos e faturamento
│   │   │   │   ├── api-keys/         # Chaves de API
│   │   │   │   └── settings/         # Configurações do usuário/workspace
│   │   │   └── layout.tsx
│   │   └── components/
│   │       ├── ui/                   # shadcn/ui components
│   │       ├── agents/               # Componentes de agente
│   │       ├── chat/                 # Componentes do inbox
│   │       ├── dashboard/            # Cards e gráficos do dashboard
│   │       └── shared/               # Componentes genéricos
│   │
│   └── api/                          # Fastify backend
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/             # Autenticação e sessão
│       │   │   ├── workspaces/       # Multi-workspace
│       │   │   ├── agents/           # CRUD de agentes
│       │   │   ├── training/         # Treinamentos (texto, URL, doc, vídeo)
│       │   │   ├── intentions/       # Intenções com webhook
│       │   │   ├── channels/         # Conexão de canais
│       │   │   ├── conversations/    # Gerenciamento de conversas
│       │   │   ├── messages/         # Mensagens
│       │   │   ├── contacts/         # CRM de contatos
│       │   │   ├── knowledge/        # Base de conhecimento vetorial
│       │   │   ├── integrations/     # Integrações externas (Calendar, ElevenLabs, etc.)
│       │   │   ├── mcp/              # Servidores MCP
│       │   │   ├── billing/          # Planos, créditos, faturamento
│       │   │   ├── analytics/        # Métricas e relatórios
│       │   │   ├── webhooks/         # Receber webhooks dos canais
│       │   │   └── ai/               # Motor de IA (LLM, RAG, embeddings)
│       │   ├── lib/
│       │   │   ├── prisma.ts
│       │   │   ├── redis.ts
│       │   │   ├── queue.ts
│       │   │   ├── socket.ts
│       │   │   └── logger.ts
│       │   └── index.ts
│       └── prisma/
│           └── schema.prisma
│
├── packages/
│   ├── shared/                       # Tipos TypeScript compartilhados
│   └── widget/                       # Widget de chat para sites (vanilla JS)
│
└── docker-compose.yml                # Desenvolvimento local
```

---

## 3. Schema do Banco de Dados (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── USUÁRIOS E WORKSPACES ─────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  passwordHash  String?
  phone         String?
  avatarUrl     String?
  language      String    @default("pt-br")
  theme         String    @default("light")
  twoFactorSecret String?
  twoFactorEnabled Boolean @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  workspaceMembers WorkspaceMember[]
  sessions         Session[]
  apiKeys          ApiKey[]
}

model Workspace {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  plan        Plan     @default(TRIAL)
  trialEndsAt DateTime?
  credits     Int      @default(1000)  // créditos disponíveis
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members          WorkspaceMember[]
  agents           Agent[]
  channels         Channel[]
  contacts         Contact[]
  conversations    Conversation[]
  knowledgeBases   KnowledgeBase[]
  attendances      Attendance[]
  envVariables     EnvVariable[]
  subscriptions    Subscription[]
  invoices         Invoice[]
}

enum Plan {
  TRIAL
  BASIC
  STANDARD
  CORPORATE
  ENTERPRISE
}

model WorkspaceMember {
  id          String    @id @default(cuid())
  role        MemberRole @default(AGENT)
  userId      String
  workspaceId String
  createdAt   DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([userId, workspaceId])
}

enum MemberRole {
  OWNER
  ADMIN
  AGENT
}

model Session {
  id           String   @id @default(cuid())
  userId       String
  refreshToken String   @unique
  expiresAt    DateTime
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ApiKey {
  id          String   @id @default(cuid())
  name        String
  keyHash     String   @unique
  lastUsedAt  DateTime?
  userId      String
  workspaceId String
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// ─── AGENTES ──────────────────────────────────────────────────────

model Agent {
  id              String   @id @default(cuid())
  name            String
  avatarUrl       String?
  purpose         AgentPurpose @default(SUPPORT)
  companyName     String?
  companyWebsite  String?
  companyDesc     String?  @db.Text
  behavior        String?  @db.Text   // prompt de comportamento (max 3000 chars)
  communicationStyle CommunicationStyle @default(NORMAL)
  llmModel        String   @default("claude-3-5-haiku-20241022")
  workspaceId     String
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  workspace       Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  trainings       Training[]
  intentions      Intention[]
  integrations    AgentIntegration[]
  mcpServers      AgentMcpServer[]
  agentChannels   AgentChannel[]
  config          AgentConfig?
  conversations   Conversation[]
}

enum AgentPurpose {
  SUPPORT
  SALES
  PERSONAL
}

enum CommunicationStyle {
  FORMAL
  NORMAL
  CASUAL
}

model AgentConfig {
  id                      String   @id @default(cuid())
  agentId                 String   @unique
  transferToHuman         Boolean  @default(true)
  summarizeOnTransfer     Boolean  @default(false)
  useEmojis               Boolean  @default(false)
  signNameInResponses     Boolean  @default(false)
  restrictTopics          Boolean  @default(false)
  splitLongMessages       Boolean  @default(false)
  allowReminders          Boolean  @default(true)
  smartTrainingSearch     Boolean  @default(false)   // Beta: RAG no momento certo
  timezone                String   @default("America/Sao_Paulo")
  responseDelay           Int      @default(0)       // delay em segundos antes de responder
  maxInteractionsPerChat  Int?                       // null = sem limite
  workingHours            Json?                      // { mon: {start:"09:00",end:"18:00"}, ... }
  webhookEvents           Json?                      // lista de eventos a enviar
  transferRules           Json?                      // regras customizadas de transferência
  inactivityActions       Json?                      // [{ afterMinutes: 10, action: "close" }]
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  agent Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)
}

// ─── TREINAMENTOS ─────────────────────────────────────────────────

model Training {
  id          String       @id @default(cuid())
  agentId     String
  type        TrainingType
  title       String?
  content     String?      @db.Text   // para tipo TEXT
  url         String?                 // para tipo WEBSITE ou VIDEO
  fileUrl     String?                 // para tipo DOCUMENT
  fileName    String?
  fileSize    Int?
  status      TrainingStatus @default(PENDING)
  errorMsg    String?
  chunkCount  Int          @default(0)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  agent    Agent          @relation(fields: [agentId], references: [id], onDelete: Cascade)
  chunks   TrainingChunk[]
}

enum TrainingType {
  TEXT
  WEBSITE
  VIDEO
  DOCUMENT
}

enum TrainingStatus {
  PENDING
  PROCESSING
  DONE
  ERROR
}

model TrainingChunk {
  id         String   @id @default(cuid())
  trainingId String
  content    String   @db.Text
  embedding  Unsupported("vector(1536)")?
  createdAt  DateTime @default(now())

  training Training @relation(fields: [trainingId], references: [id], onDelete: Cascade)
}

// ─── BASE DE CONHECIMENTO (compartilhada) ─────────────────────────

model KnowledgeBase {
  id          String   @id @default(cuid())
  name        String
  description String?
  workspaceId String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace    Workspace             @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  documents    KnowledgeDocument[]
  agentLinks   AgentKnowledgeBase[]
}

model KnowledgeDocument {
  id              String   @id @default(cuid())
  knowledgeBaseId String
  title           String
  content         String   @db.Text
  fileUrl         String?
  fileName        String?
  status          TrainingStatus @default(PENDING)
  chunkCount      Int      @default(0)
  createdAt       DateTime @default(now())

  knowledgeBase KnowledgeBase  @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  chunks        KnowledgeChunk[]
}

model KnowledgeChunk {
  id         String   @id @default(cuid())
  documentId String
  content    String   @db.Text
  embedding  Unsupported("vector(1536)")?
  createdAt  DateTime @default(now())

  document KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
}

model AgentKnowledgeBase {
  agentId         String
  knowledgeBaseId String
  createdAt       DateTime @default(now())

  agent         Agent         @relation(fields: [agentId], references: [id], onDelete: Cascade)
  knowledgeBase KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)

  @@id([agentId, knowledgeBaseId])
}

// ─── INTENÇÕES ────────────────────────────────────────────────────

model Intention {
  id          String   @id @default(cuid())
  agentId     String
  name        String
  description String?  @db.Text    // quando usar essa intenção
  fields      Json?                 // campos a coletar do cliente: [{ name, label, type, required }]
  actionType  IntentionAction @default(WEBHOOK)
  webhookUrl  String?
  webhookMethod String @default("POST")
  webhookHeaders Json?
  webhookParams Json?
  webhookBody Json?
  outputVariables Json?            // variáveis a persistir no contato
  responseMode IntentionResponseMode @default(INTERPRET_API)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  agent Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)
}

enum IntentionAction {
  WEBHOOK
  INTERNAL
}

enum IntentionResponseMode {
  INTERPRET_API       // IA interpreta resposta da API e responde naturalmente
  FIXED_MESSAGE       // Mensagem fixa configurada
  API_RAW             // Retorna resposta crua da API
}

// ─── CANAIS ───────────────────────────────────────────────────────

model Channel {
  id            String      @id @default(cuid())
  workspaceId   String
  type          ChannelType
  name          String
  isActive      Boolean     @default(true)
  config        Json        // configuração específica do canal
  webhookSecret String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  workspace     Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  agentChannels AgentChannel[]
  conversations Conversation[]
}

enum ChannelType {
  WHATSAPP
  INSTAGRAM
  FACEBOOK
  TELEGRAM
  WIDGET
  EMAIL
  SMS
}

model AgentChannel {
  agentId   String
  channelId String
  createdAt DateTime @default(now())

  agent   Agent   @relation(fields: [agentId], references: [id], onDelete: Cascade)
  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@id([agentId, channelId])
}

// ─── CONTATOS ─────────────────────────────────────────────────────

model Contact {
  id          String   @id @default(cuid())
  workspaceId String
  name        String?
  phone       String?
  email       String?
  avatarUrl   String?
  channelId   String?
  externalId  String?   // ID no canal externo (ex: WhatsApp phone)
  variables   Json?     // variáveis persistidas pelas intenções
  tags        String[]  @default([])
  notes       String?   @db.Text
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  workspace     Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  conversations Conversation[]

  @@unique([workspaceId, channelId, externalId])
}

// ─── CONVERSAS E MENSAGENS ────────────────────────────────────────

model Conversation {
  id              String             @id @default(cuid())
  workspaceId     String
  agentId         String
  channelId       String
  contactId       String
  status          ConversationStatus @default(AI_ACTIVE)
  assignedToId    String?            // membro humano responsável (se escalado)
  protocol        String             @unique @default(cuid())
  startedAt       DateTime           @default(now())
  endedAt         DateTime?
  creditsUsed     Int                @default(0)
  interactionCount Int               @default(0)
  transferSummary String?            @db.Text  // resumo gerado ao transferir para humano
  closedBy        String?            // "ai" | "human" | "inactivity"
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  workspace  Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  agent      Agent      @relation(fields: [agentId], references: [id])
  channel    Channel    @relation(fields: [channelId], references: [id])
  contact    Contact    @relation(fields: [contactId], references: [id])
  messages   Message[]
}

enum ConversationStatus {
  AI_ACTIVE       // IA respondendo
  WAITING_HUMAN   // aguardando atendente humano (em espera)
  HUMAN_ACTIVE    // humano respondendo
  CLOSED          // encerrada
}

model Message {
  id             String      @id @default(cuid())
  conversationId String
  role           MessageRole
  content        String      @db.Text
  mediaUrl       String?
  mediaType      String?     // image, audio, video, document
  creditsUsed    Int         @default(0)
  intentionId    String?     // se esta mensagem disparou uma intenção
  metadata       Json?       // dados extras (ex: timestamp do canal)
  createdAt      DateTime    @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}

enum MessageRole {
  USER      // mensagem do cliente
  ASSISTANT // mensagem da IA
  HUMAN     // mensagem do atendente humano
  SYSTEM    // mensagem de sistema (ex: "atendimento transferido")
}

// ─── ATENDIMENTOS (histórico completo) ────────────────────────────

model Attendance {
  id             String   @id @default(cuid())
  workspaceId    String
  conversationId String   @unique
  contactName    String?
  contactPhone   String?
  channelType    ChannelType
  agentName      String
  assigneeName   String?
  status         String
  startedAt      DateTime
  endedAt        DateTime?
  durationSeconds Int?
  creditsUsed    Int      @default(0)
  interactionCount Int    @default(0)
  protocol       String
  createdAt      DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

// ─── INTEGRAÇÕES ──────────────────────────────────────────────────

model AgentIntegration {
  id        String          @id @default(cuid())
  agentId   String
  type      IntegrationType
  isActive  Boolean         @default(true)
  config    Json            // configuração específica da integração
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  agent Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@unique([agentId, type])
}

enum IntegrationType {
  ELEVEN_LABS
  GOOGLE_CALENDAR
  PLUG_CHAT
  E_VENDI
  SHOPIFY
  STRIPE
  PAYPAL
  INVIDEO
}

// ─── SERVIDORES MCP ───────────────────────────────────────────────

model AgentMcpServer {
  id        String   @id @default(cuid())
  agentId   String
  name      String
  url       String
  apiKey    String?  // criptografado
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  agent Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)
}

// ─── VARIÁVEIS DE AMBIENTE ────────────────────────────────────────

model EnvVariable {
  id          String   @id @default(cuid())
  workspaceId String
  key         String
  value       String   // criptografado em repouso
  type        EnvVarType @default(TEXT)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, key])
}

enum EnvVarType {
  TEXT
  NUMBER
}

// ─── FATURAMENTO ──────────────────────────────────────────────────

model Subscription {
  id            String             @id @default(cuid())
  workspaceId   String
  plan          Plan
  billingCycle  BillingCycle       @default(MONTHLY)
  status        SubscriptionStatus @default(ACTIVE)
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean       @default(false)
  externalId    String?            // ID no gateway de pagamento
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])
}

enum BillingCycle {
  MONTHLY
  QUARTERLY   // -5%
  SEMIANNUAL  // -7%
  ANNUAL      // -10%
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELED
  TRIALING
}

model Invoice {
  id          String   @id @default(cuid())
  workspaceId String
  amount      Int      // centavos
  status      String   // paid, open, void
  pdfUrl      String?
  externalId  String?
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id])
}
```

---

## 4. Rotas da API

### Autenticação (`/auth`)
```
POST   /auth/register          - Cadastro com email + senha
POST   /auth/login             - Login → retorna access_token + refresh_token
POST   /auth/refresh           - Renovar access_token
POST   /auth/logout            - Invalidar refresh_token
POST   /auth/forgot-password   - Solicitar reset de senha
POST   /auth/reset-password    - Aplicar nova senha com token
GET    /auth/2fa/setup         - Gerar QR code para TOTP
POST   /auth/2fa/verify        - Verificar e ativar 2FA
POST   /auth/2fa/disable       - Desativar 2FA
```

### Workspaces (`/workspaces`)
```
GET    /workspaces/me          - Workspace atual do usuário autenticado
PATCH  /workspaces/me          - Atualizar nome do workspace
GET    /workspaces/me/members  - Listar membros
POST   /workspaces/me/members/invite - Convidar membro por email
PATCH  /workspaces/me/members/:id   - Alterar papel do membro
DELETE /workspaces/me/members/:id   - Remover membro
```

### Agentes (`/agents`)
```
GET    /agents                 - Listar agentes do workspace
POST   /agents                 - Criar agente
GET    /agents/:id             - Detalhes do agente
PATCH  /agents/:id             - Atualizar agente
DELETE /agents/:id             - Excluir agente
PATCH  /agents/:id/toggle      - Ativar/desativar agente
GET    /agents/:id/config      - Configurações do agente
PATCH  /agents/:id/config      - Atualizar configurações
POST   /agents/:id/test        - Testar agente (retorna resposta simulada)
```

### Treinamentos (`/agents/:id/trainings`)
```
GET    /agents/:id/trainings              - Listar treinamentos
POST   /agents/:id/trainings/text        - Adicionar texto
POST   /agents/:id/trainings/website     - Adicionar URL (scraping automático)
POST   /agents/:id/trainings/document    - Upload de PDF/DOCX
POST   /agents/:id/trainings/video       - URL de vídeo (extrai legenda)
DELETE /agents/:id/trainings/:trainingId - Excluir treinamento
```

### Base de conhecimento (`/knowledge`)
```
GET    /knowledge                         - Listar bases do workspace
POST   /knowledge                         - Criar base
GET    /knowledge/:id                     - Detalhes da base
PATCH  /knowledge/:id                     - Atualizar base
DELETE /knowledge/:id                     - Excluir base
POST   /knowledge/:id/documents           - Adicionar documento
DELETE /knowledge/:id/documents/:docId    - Excluir documento
POST   /agents/:id/knowledge/:kbId        - Conectar base ao agente
DELETE /agents/:id/knowledge/:kbId        - Desconectar base do agente
```

### Intenções (`/agents/:id/intentions`)
```
GET    /agents/:id/intentions             - Listar intenções
POST   /agents/:id/intentions             - Criar intenção
GET    /agents/:id/intentions/:intentId   - Detalhes
PATCH  /agents/:id/intentions/:intentId   - Atualizar
DELETE /agents/:id/intentions/:intentId   - Excluir
POST   /agents/:id/intentions/:intentId/test - Testar webhook da intenção
POST   /agents/:id/intentions/import      - Importar JSON de intenções
```

### Canais (`/channels`)
```
GET    /channels                           - Listar canais do workspace
POST   /channels/whatsapp                 - Conectar WhatsApp (Evolution API)
POST   /channels/instagram                - Conectar Instagram (Meta API)
POST   /channels/facebook                 - Conectar Facebook Messenger
POST   /channels/telegram                 - Conectar Telegram Bot
POST   /channels/widget                   - Gerar widget de chat
DELETE /channels/:id                      - Desconectar canal
PATCH  /channels/:id/agents               - Atribuir agentes ao canal
GET    /channels/:id/qr                   - QR code do WhatsApp (Evolution API)
```

### Conversas e Chat (`/conversations`)
```
GET    /conversations                      - Listar conversas (filtros: status, agente, canal)
GET    /conversations/:id                  - Detalhes da conversa
GET    /conversations/:id/messages         - Mensagens da conversa
POST   /conversations/:id/messages         - Enviar mensagem como humano
POST   /conversations/:id/assume           - Assumir conversa (humano entra)
POST   /conversations/:id/transfer         - Transferir para humano / de volta para IA
POST   /conversations/:id/close            - Encerrar conversa
```

### Contatos (`/contacts`)
```
GET    /contacts                           - Listar contatos (busca, paginação)
GET    /contacts/:id                       - Detalhes do contato
PATCH  /contacts/:id                       - Atualizar contato
DELETE /contacts/:id                       - Excluir contato
GET    /contacts/:id/conversations         - Histórico de conversas do contato
```

### Analytics (`/analytics`)
```
GET    /analytics/overview                 - Resumo: atendimentos, créditos, contatos, agendamentos
GET    /analytics/attendance               - Métricas de atendimento detalhadas
GET    /analytics/timeline                 - Créditos por período (dia/semana/mês)
GET    /analytics/by-channel              - Créditos por canal
GET    /analytics/top-agents              - Top agentes por créditos gastos
GET    /analytics/top-attendants          - Top atendentes humanos
GET    /analytics/top-contacts            - Top contatos por interações
# Query params: start, end, agentId, channelId
```

### Atendimentos (`/attendances`)
```
GET    /attendances                        - Listar com filtros e paginação
GET    /attendances/:id                    - Detalhes
GET    /attendances/export                 - Exportar CSV
```

### Integrações (`/agents/:id/integrations`)
```
GET    /agents/:id/integrations            - Listar integrações ativas
POST   /agents/:id/integrations/:type      - Ativar integração
PATCH  /agents/:id/integrations/:type      - Atualizar configuração
DELETE /agents/:id/integrations/:type      - Desativar integração
```

### Servidores MCP (`/agents/:id/mcp`)
```
GET    /agents/:id/mcp                     - Listar servidores MCP
POST   /agents/:id/mcp                     - Adicionar servidor MCP
PATCH  /agents/:id/mcp/:mcpId             - Atualizar
DELETE /agents/:id/mcp/:mcpId             - Remover
```

### Variáveis de Ambiente (`/env-variables`)
```
GET    /env-variables                      - Listar (sem exibir valores)
POST   /env-variables                      - Criar variável
PATCH  /env-variables/:id                  - Atualizar valor
DELETE /env-variables/:id                  - Excluir
```

### Faturamento (`/billing`)
```
GET    /billing                            - Assinatura atual + créditos
GET    /billing/plans                      - Planos disponíveis com preços
POST   /billing/subscribe                  - Assinar plano
POST   /billing/cancel                     - Cancelar assinatura
GET    /billing/invoices                   - Histórico de faturas
PATCH  /billing/billing-info               - Atualizar dados para nota fiscal
```

### API Keys (`/api-keys`)
```
GET    /api-keys                           - Listar chaves (sem mostrar o valor completo)
POST   /api-keys                           - Gerar nova chave (retorna apenas 1x o valor completo)
DELETE /api-keys/:id                       - Revogar chave
```

### Webhooks externos (receber dos canais)
```
POST   /webhooks/whatsapp/:channelId       - Evolution API → receber mensagens WhatsApp
POST   /webhooks/meta/:channelId           - Meta API → Instagram + Facebook
POST   /webhooks/telegram/:channelId       - Telegram Bot API
```

---

## 5. Fluxo Completo de uma Mensagem

```
1. Cliente envia mensagem no WhatsApp
2. Evolution API dispara POST para /webhooks/whatsapp/:channelId
3. Middleware valida assinatura HMAC do webhook
4. Mensagem é colocada na fila Redis (BullMQ) - garante ordem e resiliência
5. Worker processa a mensagem:
   a. Identifica ou cria o Contact
   b. Encontra ou cria a Conversation
   c. Salva a Message com role=USER
   d. Verifica se conversa está em status HUMAN_ACTIVE → envia para humano via Socket.io
   e. Se status AI_ACTIVE:
      i.   Carrega configuração e perfil do agente
      ii.  Verifica horário de atendimento (se fora do horário, responde padrão)
      iii. Busca intenção relevante (classificação por LLM ou keywords)
      iv.  Se intenção encontrada: executa webhook, coleta variáveis, persiste no contato
      v.   Se não: executa RAG (busca vetorial nos treinamentos + knowledge bases)
      vi.  Monta prompt completo: [system] + [knowledge] + [history] + [user message]
      vii. Chama LLM (Claude ou modelo configurado)
      viii.Salva resposta como Message com role=ASSISTANT
      ix.  Deduz créditos do workspace
      x.   Verifica regras de transferência → se atingida, muda status para WAITING_HUMAN
      xi.  Aplica delay configurado (responseDelay)
      xii. Se splitLongMessages=true, divide resposta em partes
6. Envia resposta de volta pelo canal (Evolution API, Meta API, etc.)
7. Atualiza métricas do Attendance
8. Notifica painel em tempo real via Socket.io
```

---

## 6. Telas e Componentes do Frontend

### 6.1 Onboarding (4 passos — wizard linear)

Exibido apenas na **primeira vez** que o usuário entra, após o cadastro.

```
Passo 1 — Experiência com IA:
  - Layout: metade esquerda com gradiente (brand) + metade direita com formulário
  - Stepper: 4 etapas (Experiência → Objetivo → Setor → Atividade)
  - Pergunta: "Como você descreveria o estágio atual da sua empresa em relação ao uso de IA?"
  - Opções (radio cards): 
      "Estamos dando os primeiros passos com IA"
      "Já temos experiências iniciais implementadas"
      "Já temos soluções maduras rodando"
  - Botão: CONTINUAR

Passo 2 — Objetivo:
  - Pergunta: "Para qual objetivo você gostaria de utilizar o SyncroFlow?"
  - Opções:
      "Para minha própria empresa ou produto"
      "Para oferecer serviços baseados em IA para outras empresas"

Passo 3 — Setor:
  - Pergunta: "Quais setores sua empresa pretende atender usando nossas soluções?"
  - Lista scrollável (selecionar múltiplos):
      Educação, Clínicas/Saúde, Salão de Beleza/Barbearia, Advocacia/Jurídico,
      E-commerce, Imobiliário, Restaurantes/Food, Tecnologia, Outros
  
Passo 4 — Maturidade:
  - Pergunta: "Há quanto tempo sua empresa está no mercado?"
  - Opções: Menos de 1 ano, Entre 1 e 5 anos, Entre 5 e 10 anos, Mais de 10 anos

Ao finalizar: salvar respostas + redirecionar para /dashboard com tour interativo ativado
```

**Diferencial do SyncroFlow:** adicionar um passo 5 opcional após o onboarding:
"Crie seu primeiro agente agora mesmo" com wizard inline na tela de boas-vindas.

---

### 6.2 Layout Principal (após login)

**Sidebar lateral fixa (esquerda):**
```
Logo SyncroFlow (topo)
Campo de busca de agentes

[seção: MEU WORKSPACE]
  - Dropdown com nome do workspace (troca de workspace)

[seção: VISÃO GERAL]
  📊 Dashboards

[seção: CADASTROS]
  🤖 Agentes
  👥 Equipe
  📡 Canais

[seção: COMUNICAÇÃO]
  💬 Chat (inbox ao vivo)
  📋 Contatos

[seção: CENTRAL]
  ⚙️ Mais opções (abre grid modal)

[rodapé da sidebar]
  Card de trial/plano com countdown (se em trial)
  Botão "Upgrade" em destaque

[topbar]
  Créditos disponíveis (ícone moeda)
  Sino de notificações
  Avatar + nome do usuário → dropdown:
    Idioma, Tema (Light/Dark), Tutoriais, Suporte, Comunidade, Chave de API, Sair
```

---

### 6.3 Dashboard

**Duas abas:** Visão Geral | Atendimento

**Filtro de período (dropdown):** Últimos 7 dias | 30 dias | 60 dias | 90 dias | Último ano | Período customizado

**Filtro adicional:** Por agente | Por canal

**Visão Geral — Cards KPI:**
```
1. Atendimentos Concluídos     (com % vs período anterior)
2. Créditos Gastos             (com % vs período anterior)
3. Novos Contatos              (com % vs período anterior)
4. Total de Agendamentos       (com % vs período anterior)
```

**Visão Geral — Gráficos:**
```
5. Créditos por Período        (linha — evolução dia a dia)
6. Gastos por Modelo           (pizza — distribuição por LLM usado)
7. Top Agentes                 (tabela ranqueada — créditos gastos)
8. Top Atendentes              (tabela ranqueada — atendimentos resolvidos)
9. Top Contatos                (tabela ranqueada — interações)
```

**Aba Atendimento — Cards KPI:**
```
1. Total de Atendimentos (com breakdown: Concluído / Em andamento / Esperando humano)
2. Média de Créditos por Atendimento (+ atendimento com mais/menos créditos)
3. Média de Interações (+ mín. e máx.)
4. Média de Custo (+ atendimento mais caro / mais barato)
```

**Aba Atendimento — Gráficos:**
```
5. Timeline de Consumo         (barras — pico 1°, 2°, 3° por hora do dia)
6. Créditos por Canal          (barras horizontais)
7. Top Canais                  (ranking com mais conversas)
```

**Diferencial do SyncroFlow:** adicionar cards de:
- Taxa de resolução pela IA (sem precisar de humano)
- Tempo médio de primeira resposta
- NPS/CSAT se integração de pesquisa de satisfação ativa

---

### 6.4 Agentes — Lista

```
- Header: "Agentes" + botão "+ Novo Agente"
- Campo de busca por nome
- Grid de cards de agentes:
    Avatar circular
    Nome do agente
    Finalidade (badge: Suporte / Vendas / Pessoal)
    Status toggle (ativo/inativo)
    Empresa
    Modelo LLM
    Botões: Editar | Testar IA | ...mais
- Estado vazio: ilustração + "Crie seu primeiro agente"
```

---

### 6.5 Wizard de Criação de Agente (modal, 5 passos)

```
Passo 1 — Nome:
  Avatar gerado automaticamente (estilo cartoon/avatar)
  Campo: "Qual o nome do seu agente?"
  
Passo 2 — Objetivo:
  Ícones grandes clicáveis: 🎧 Suporte | 🛒 Vendas | 👤 Uso pessoal

Passo 3 — Empresa:
  Campo: "Qual nome da empresa?" (se Suporte ou Vendas)
  
Passo 4 — Descrição:
  Campo textarea: "Descreva sobre [Empresa]" (max 500 chars)

Passo 5 — Configurações rápidas (toggles):
  Transferir para humano (ativado por padrão)
  Usar emojis nas respostas
  Restringir temas permitidos
  Dividir resposta em partes

Conclusão — Tela de boas-vindas ao agente:
  Avatar do agente + nome
  "Seu agente foi criado com sucesso!"
  3 opções como cards clicáveis:
    → Fazer treinamentos
    → Conectar canais
    → Ajustar configurações
```

---

### 6.6 Detalhe do Agente

**Sidebar interna (esquerda do painel):**
```
Avatar (clicável para trocar, indicador de status online)
Nome do agente
Cargo (ex: "Suporte em Mendes advocacia")
Seletor de LLM (dropdown: Claude, GPT-4, Gemini...)
─────────────────
👤 Perfil
📋 Trabalho
🧠 Treinamentos
🎯 Intenções
🔗 Integrações
⚙️ Servidores MCP
📡 Canais
⚙️ Configurações
─────────────────
[Botão] 🧪 Teste sua IA
```

#### Aba: Perfil
```
Seção: Informações pessoais
  - Nome do agente (input)
  - Comunicação (3 botões toggle): FORMAL | NORMAL | DESCONTRAÍDA
  - Comportamento (textarea 0/3000): "Descreva como o agente deve se comportar..."
    - Botão de histórico (ver versões anteriores do comportamento)
  
Botão: Salvar
```

#### Aba: Trabalho
```
Seção: Informações sobre trabalho
  - Finalidade (3 cards): Suporte | Vendas | Uso pessoal
  - Presta suporte para (empresa) — input max 50 chars
  - Site oficial (opcional) — input URL
  - Descrição (textarea max 500 chars)

Botão: Salvar
```

#### Aba: Treinamentos
```
Header: "Treinamentos" + campo de busca

5 sub-abas:
  TEXTO:
    - Área de texto (0/1028 chars) com Enter para adicionar
    - Botões de mídia: imagem, vídeo, link, arquivo
    - Botão: Cadastrar
    - Lista de treinamentos de texto com opção de excluir
    
  WEBSITE:
    - Campo URL
    - Opção de crawling completo do site ou só a URL
    - Status: aguardando processamento → processando → concluído / erro
    
  VIDEO:
    - Campo URL (YouTube, Vimeo)
    - Extrai legenda/transcrição automaticamente
    
  DOCUMENTO:
    - Upload drag & drop (PDF, DOCX, TXT, CSV)
    - Barra de progresso
    - Lista com nome, tamanho, status, chunks gerados
    
  BASE DE CONHECIMENTO:
    - "Bases conectadas (compartilhadas e independentes de agente)"
    - Botão: Conectar base
    - Lista de bases conectadas com opção de desconectar

Paginação: "Itens: 7 ˅" (configurar itens por página)
```

#### Aba: Intenções
```
Estado vazio:
  Ícone de sinalização
  "Criar uma intenção"
  Descrição: "Intenções são comandos personalizados que acionam ações específicas 
              em serviços externos, como 'solicitar segunda via de um boleto'"
  Botão: CADASTRAR PRIMEIRA INTENÇÃO
  Link: Importar (JSON)

Wizard de nova intenção (3 passos):
  Passo 1 — Detalhes gerais:
    Nome da intenção (0/255) — ex: "Emite segunda via boleto"
    Quando usar essa intenção (0/512) — descreve o gatilho em linguagem natural
    
  Passo 2 — Configurar ação:
    Coletar dados do cliente (+ Adicionar campo) — campos customizados
    Ação: dropdown [Webhook]
    Método: GET | POST | PUT | PATCH | DELETE
    URL do webhook (usa @ para variáveis de ambiente)
    Tabs: Headers | Params | Body
    Botão: ⚡ Testar
    
  Passo 3 — Dados de saída:
    Persistir variáveis no contato (+ Adicionar variável)
    Resposta do agente deve ser baseada em:
      [dropdown: Na interpretação da resposta da API | Mensagem fixa | Resposta raw]
    
  Botões: Cancelar | Salvar
```

#### Aba: Integrações
```
Grid de cards (3 colunas):
  ElevenLabs:        Respostas em voz humanizada → [ATIVAR INTEGRAÇÃO]
  Google Calendar:   Agendar reuniões e criar convites → [ATIVAR INTEGRAÇÃO]
  Plug Chat:         Fallback para humano → [ATIVAR INTEGRAÇÃO]
  E-vendi:           Catálogo de e-commerce → [ATIVAR INTEGRAÇÃO]
  Shopify:           Vendas e carrinho inteligente → [ATIVAR INTEGRAÇÃO]
  Stripe:            Links de pagamento → [ATIVAR INTEGRAÇÃO]
  Paypal:            Pagamentos e tracking → [ATIVAR INTEGRAÇÃO]
  Invideo:           Vídeos personalizados → [ATIVAR INTEGRAÇÃO]
```

#### Aba: Servidores MCP
```
Card "+ MCP Server"
  Descrição: "Adicione um servidor MCP ao seu agente e permita ele se conectar com outras ferramentas"

Modal: Conectar servidor MCP
  Lista pré-configurada (com status: conectar / em breve):
    n8n, Canva, Shopify, Zapier, Vapi, Notion, Stripe, Atlassian, 
    Neon, Paypal, Asana, Invideo
  Botão: + Criar conexão MCP (custom: nome + URL + API key)
```

#### Aba: Canais
```
Aviso: "Canais agora ficam no menu principal → Canais"
Botão: Ir para Canais →
```

#### Aba: Configurações
```
4 sub-abas: Conversa | Ações de inatividade | Webhooks | Regras de transferência

SUB-ABA: Conversa
  Toggles (com ícone e descrição):
  ↔ Transferir para humano (ON)
       Habilita que o agente transfira para aba 'em espera' de equipe humana
  📑 Resumo ao transferir para humano (OFF)
       Gera automaticamente um resumo do atendimento ao transferir
  🕐 Horário de atendimento → [ícone configuração] (abre modal com grade semanal)
       Configura dias e horários que o agente pode realizar atendimentos
  😊 Usar Emojis nas Respostas (ON)
  ✍️ Assinar nome do agente nas respostas (OFF)
  💬 Restringir Temas Permitidos (OFF)
  📄 Dividir resposta em partes (OFF)
       Em caso de mensagem grande, separa em várias mensagens
  📅 Permitir registrar lembretes (ON)
  🔍 Busca inteligente do treinamento [Beta] (OFF)
       Consulta a base de treinamentos no momento certo para respostas mais precisas
  
  Dropdowns:
  🌍 Timezone do agente: (GMT-03:00) Sao Paulo
  ⏱️ Tempo de resposta: Imediatamente | 5s | 10s | 30s | ...
  🔢 Limite de interações por atendimento: Sem limite | 5 | 10 | 20 | 50

SUB-ABA: Ações de inatividade
  Botão: + Adicionar ação anterior
  Regra padrão: "Se não responder em [10 minutos ˅] o agente deve [Finalizar atendimento ˅]"
  Ações disponíveis: Finalizar atendimento | Transferir para humano | Enviar mensagem

SUB-ABA: Webhooks
  Descrição: "Escute eventos que acontecem no sistema e tome ações como enviar um webhook"
  Botão: + Adicionar novo evento
  Eventos disponíveis (com endpoint destino):
    - Nova conversa iniciada
    - Conversa encerrada
    - Transferência para humano
    - Nova mensagem recebida

SUB-ABA: Regras de transferência
  Descrição: "Configure instruções para o agente fazer transferência do atendimento"
  Botão: + Adicionar regra de transferência
  Ex: "Se o cliente mencionar [palavra/intenção], transferir para [departamento]"
```

---

### 6.7 Chat — Inbox de Moderação

```
Layout 3 colunas:

COLUNA 1 (lista de conversas):
  Header: "Todos os agentes ˅" (filtrar por agente)
  Campo de busca por nome ou telefone
  Tabs: Todos | Em espera | Andamento | Meus
  Lista de conversas com:
    - Avatar do contato
    - Nome + canal (ícone WhatsApp/IG/etc)
    - Preview da última mensagem
    - Timestamp
    - Badge de não lidas
    - Badge de status (Em espera / IA ativa / Humano)
  Estado vazio: ilustração de robô + "Moderação de atendimentos"

COLUNA 2 (conversa aberta):
  Header: nome do contato + canal + status + botões de ação
  Botões: Assumir | Transferir | Encerrar | Ver perfil
  Mensagens com balões (user=direita, IA=esquerda, humano=cor diferente)
  Indicador de quem está "digitando"
  Input de resposta (só disponível quando atendente assumiu a conversa)
  
COLUNA 3 (perfil do contato):
  Avatar + nome + telefone + canal
  Tags editáveis
  Notas do atendente
  Variáveis persistidas pelas intenções
  Histórico de conversas anteriores
```

---

### 6.8 Contatos

```
Header: "Contatos" + subtítulo
Estado vazio: ilustração + "Meus contatos" + descrição

Lista preenchida:
  Tabela com: Avatar | Nome | Telefone | Canal | Criado em | Tags | Ações
  Busca por nome, telefone, email
  Filtros: por canal, por tag, por período
  Exportar CSV
  
Detalhe do contato (modal ou página):
  Informações: nome, telefone, email, canal
  Variáveis de ambiente do contato (definidas pelas intenções)
  Tags
  Notas
  Histórico de conversas (lista clicável)
```

---

### 6.9 Canais (gerenciamento global)

```
Header: "Canais" + botão "+ Conectar canal"

Grid de canais disponíveis:
  WhatsApp (Evolution API):
    - QR Code para escanear
    - Status: Conectado / Desconectado / Aguardando QR
    - Número conectado
    - Agentes atribuídos
    
  Instagram:
    - Botão: Conectar com Meta
    - OAuth flow (redirect Meta)
    - Conta conectada: @username
    
  Facebook Messenger:
    - Mesmo flow do Instagram (mesma Meta App)
    - Página conectada
    
  Telegram:
    - Campo: Bot Token
    - Nome do bot
    
  Widget para sites:
    - Preview do widget
    - Configurações: cor, posição, mensagem de boas-vindas
    - Código para copiar (script tag)
    - Domínios permitidos

Por canal conectado:
  Status badge (Ativo / Inativo)
  Agentes atribuídos (select múltiplo)
  Configurações específicas
  Botão: Desconectar
```

---

### 6.10 Mais Opções (grid modal)

```
6 ícones em grid:
  🧠 Base de conhecimento  → /knowledge
  📋 Atendimentos          → /attendances
  {x} Variáveis de ambiente → modal
  🔑 Chave de API          → /api-keys
  💳 Faturamento           → /billing
  ⚙️ Configurações          → modal de configurações do usuário
```

---

### 6.11 Base de Conhecimento

```
Header: "Base de conhecimento" + botão "+ Nova base"
Estado vazio: ícone de cérebro + mensagem

Lista de bases:
  Nome | Documentos | Agentes usando | Data de criação | Ações

Detalhe da base:
  Nome e descrição (editável)
  Lista de documentos com: nome, tamanho, status, chunks
  Botão: + Adicionar documento (upload ou texto)
  Lista de agentes que utilizam esta base
```

---

### 6.12 Atendimentos (histórico)

```
Header: "Atendimentos" + subtítulo

Tabela com:
  Nome | Canal | Status | Responsável | Início | Fim | Duração | Protocolo

Filtros:
  Buscar por nome ou telefone
  Filtrar por: status, canal, agente, responsável, período
  
Botão: Exportar (CSV)
Paginação com "Mostrando X a Y de Z atendimentos"

Click em linha: abre detalhes do atendimento com transcrição completa
```

---

### 6.13 Faturamento

```
Header de status: "Sua assinatura está em período de teste" (ou plano atual)
Créditos disponíveis

Toggle de ciclo: Mensal | Trimestral (-5%) | Semestral (-7%) | Anual (-10%)

3 cards de planos:
  BASIC:     R$ 87/mês  | 2.500 créditos | 5 agentes
  STANDARD:  R$ 397/mês | 11.500 créditos | 20 agentes  [Mais popular]
  CORPORATE: R$ 997/mês | 30.000 créditos | 50 agentes

Todos incluem: Widget para sites | Intenções avançadas | API completa

Seção: "Dados para Notas Fiscais" (CNPJ, Razão social, endereço)
Seção: "Precisa de mais volume? → Falar com vendas"
Histórico de faturas (lista: data, valor, status, PDF)
```

---

### 6.14 Configurações do Usuário (modal)

```
4 abas: Perfil | Workspace | Senha | Segurança

Perfil:
  Foto (upload com preview circular)
  Nome
  Nome da empresa
  Número de WhatsApp (com seletor de bandeira/DDI)
  Email
  Confirmar senha para salvar

Workspace:
  Nome da área de trabalho (max 32 chars)
  [Botão] APLICAR ALTERAÇÕES

Senha:
  Senha atual
  Nova senha
  Confirmar nova senha
  [Botão] ALTERAR SENHA

Segurança — 2FA:
  Configurar Autenticação de 2 Fatores
  Etapa 1: Escaneie o QR Code
  Etapa 2: Insira o código de verificação (6 dígitos)
  Etapa 3: Pronto!
  [Botão] CONFIGURAR AGORA
```

---

### 6.15 Teste sua IA (sidebar do agente)

```
Modal ou painel lateral deslizante:
  Header: "Testar agente: [nome]"
  Interface de chat simulado
  Campo de mensagem + enviar
  Respostas em tempo real do agente
  Exibe: créditos usados, modelo, tempo de resposta
  Botão: Limpar conversa
  Botão: Fechar
```

---

## 7. Motor de IA — Implementação

### 7.1 Prompt System

```typescript
// Estrutura do prompt enviado ao LLM
function buildSystemPrompt(agent: Agent, config: AgentConfig): string {
  return `
Você é ${agent.name}, um assistente de ${agent.purpose === 'SUPPORT' ? 'suporte' : 'vendas'} 
da empresa ${agent.companyName}.

${agent.companyDesc ? `Sobre a empresa: ${agent.companyDesc}` : ''}
${agent.companyWebsite ? `Site oficial: ${agent.companyWebsite}` : ''}

Estilo de comunicação: ${config.communicationStyle === 'FORMAL' ? 'formal' : config.communicationStyle === 'CASUAL' ? 'descontraído' : 'normal'}
${config.useEmojis ? 'Você pode usar emojis nas respostas.' : 'Não use emojis.'}
${config.signNameInResponses ? `Assine suas respostas com "${agent.name}".` : ''}
${config.restrictTopics ? 'Responda apenas sobre assuntos relacionados à empresa e seus serviços.' : ''}
${config.splitLongMessages ? 'Divida respostas longas em partes menores.' : ''}

${agent.behavior || ''}

${/* Injetar conhecimento recuperado via RAG */ ''}
CONHECIMENTO RELEVANTE:
{knowledge_context}

Regras importantes:
- Se não souber algo, diga que vai verificar e não invente informações
- ${config.transferToHuman ? 'Se o cliente pedir para falar com humano, transfira o atendimento' : ''}
- Data/hora atual: {current_datetime}
`.trim()
}
```

### 7.2 RAG — Busca Vetorial

```typescript
// Buscar chunks relevantes para a mensagem do usuário
async function retrieveContext(
  message: string,
  agentId: string,
  topK: number = 5
): Promise<string> {
  // 1. Gerar embedding da mensagem do usuário
  const embedding = await generateEmbedding(message)
  
  // 2. Buscar no pgvector (treinamentos do agente + knowledge bases)
  const chunks = await prisma.$queryRaw`
    SELECT content, 1 - (embedding <=> ${embedding}::vector) as similarity
    FROM (
      SELECT tc.content, tc.embedding FROM "TrainingChunk" tc
      INNER JOIN "Training" t ON t.id = tc."trainingId"
      WHERE t."agentId" = ${agentId} AND t.status = 'DONE'
      UNION ALL
      SELECT kc.content, kc.embedding FROM "KnowledgeChunk" kc
      INNER JOIN "KnowledgeDocument" kd ON kd.id = kc."documentId"
      INNER JOIN "AgentKnowledgeBase" akb ON akb."knowledgeBaseId" = kd."knowledgeBaseId"
      WHERE akb."agentId" = ${agentId}
    ) combined
    WHERE 1 - (embedding <=> ${embedding}::vector) > 0.7
    ORDER BY similarity DESC
    LIMIT ${topK}
  `
  
  return chunks.map(c => c.content).join('\n\n')
}
```

### 7.3 Detecção de Intenção

```typescript
// Detectar se a mensagem do usuário corresponde a uma intenção cadastrada
async function detectIntention(
  message: string,
  intentions: Intention[]
): Promise<Intention | null> {
  if (intentions.length === 0) return null
  
  // Usar o LLM para classificar
  const intentionList = intentions
    .map(i => `- ID: ${i.id} | Nome: ${i.name} | Quando usar: ${i.description}`)
    .join('\n')
    
  const response = await callLLM({
    model: 'claude-3-5-haiku-20241022', // modelo mais rápido para classificação
    system: `Você é um classificador de intenções. Analise a mensagem e determine se ela corresponde a alguma intenção listada. Responda APENAS com o ID da intenção ou "none".`,
    user: `Mensagem: "${message}"\n\nIntenções disponíveis:\n${intentionList}`
  })
  
  const intentionId = response.trim()
  if (intentionId === 'none') return null
  return intentions.find(i => i.id === intentionId) || null
}
```

### 7.4 Modelo de Créditos

```
1 crédito = ~750 tokens de entrada + saída combinados

Cálculo:
  credits_used = Math.ceil((input_tokens + output_tokens) / 750)

Modelos e custo relativo (créditos por 1000 tokens):
  claude-3-5-haiku  → 1 crédito por 750 tokens  (mais barato)
  claude-3-5-sonnet → 3 créditos por 750 tokens
  claude-opus-4     → 10 créditos por 750 tokens
  gpt-4o-mini       → 1 crédito por 750 tokens
  gpt-4o            → 5 créditos por 750 tokens

Créditos por plano por mês:
  TRIAL:     1.000 créditos (7 dias)
  BASIC:     2.500 créditos
  STANDARD:  11.500 créditos
  CORPORATE: 30.000 créditos
```

---

## 8. Integrações com Canais

### 8.1 WhatsApp — Arquitetura Multi-Provider (trocável)

O SyncroFlow usa um **padrão de abstração por provider**. Toda a lógica de negócio fala com uma interface única (`WhatsAppProvider`). Para trocar de Z-API para Evolution API (ou vice-versa), basta mudar uma variável de ambiente — zero mudança no código de negócio.

#### Interface comum (contrato)

```typescript
// apps/api/src/modules/channels/whatsapp/provider.interface.ts

export interface WhatsAppMessage {
  from: string        // telefone do remetente (ex: "5511999999999")
  name: string        // nome do contato
  text?: string
  mediaUrl?: string
  mediaType?: 'image' | 'audio' | 'video' | 'document'
  messageId: string
  timestamp: number
}

export interface WhatsAppProvider {
  // Gerenciamento de instância
  createInstance(channelId: string): Promise<void>
  deleteInstance(channelId: string): Promise<void>
  getQRCode(channelId: string): Promise<string>          // base64 da imagem
  getStatus(channelId: string): Promise<'connected' | 'disconnected' | 'qr_required'>

  // Envio de mensagens
  sendText(channelId: string, to: string, text: string): Promise<void>
  sendMedia(channelId: string, to: string, mediaUrl: string, caption?: string): Promise<void>
  sendAudio(channelId: string, to: string, audioUrl: string): Promise<void>

  // Normalização do webhook recebido
  parseWebhook(payload: unknown): WhatsAppMessage | null
}
```

#### Implementação: Evolution API

```typescript
// apps/api/src/modules/channels/whatsapp/providers/evolution.provider.ts

export class EvolutionApiProvider implements WhatsAppProvider {
  private baseUrl = process.env.EVOLUTION_API_URL!
  private apiKey  = process.env.EVOLUTION_API_KEY!

  async createInstance(channelId: string) {
    await axios.post(`${this.baseUrl}/instance/create`, {
      instanceName: channelId,
      token: this.apiKey,
      webhook: `${process.env.API_URL}/webhooks/whatsapp/${channelId}`,
      webhookByEvents: true,
      events: ['MESSAGES_UPSERT']
    }, { headers: { apikey: this.apiKey } })
  }

  async getQRCode(channelId: string): Promise<string> {
    const res = await axios.get(`${this.baseUrl}/instance/connect/${channelId}`, {
      headers: { apikey: this.apiKey }
    })
    return res.data.qrcode.base64
  }

  async getStatus(channelId: string) {
    const res = await axios.get(`${this.baseUrl}/instance/connectionState/${channelId}`, {
      headers: { apikey: this.apiKey }
    })
    const state = res.data.instance.state
    if (state === 'open') return 'connected'
    if (state === 'qr') return 'qr_required'
    return 'disconnected'
  }

  async sendText(channelId: string, to: string, text: string) {
    await axios.post(`${this.baseUrl}/message/sendText/${channelId}`, {
      number: to, text
    }, { headers: { apikey: this.apiKey } })
  }

  async sendMedia(channelId: string, to: string, mediaUrl: string, caption?: string) {
    await axios.post(`${this.baseUrl}/message/sendMedia/${channelId}`, {
      number: to, mediatype: 'image', media: mediaUrl, caption
    }, { headers: { apikey: this.apiKey } })
  }

  async sendAudio(channelId: string, to: string, audioUrl: string) {
    await axios.post(`${this.baseUrl}/message/sendWhatsAppAudio/${channelId}`, {
      number: to, audio: audioUrl
    }, { headers: { apikey: this.apiKey } })
  }

  parseWebhook(payload: any): WhatsAppMessage | null {
    if (payload.event !== 'messages.upsert') return null
    if (payload.data.key.fromMe) return null
    return {
      from: payload.data.key.remoteJid.replace('@s.whatsapp.net', ''),
      name: payload.data.pushName || 'Desconhecido',
      text: payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text,
      messageId: payload.data.key.id,
      timestamp: payload.data.messageTimestamp
    }
  }

  async deleteInstance(channelId: string) {
    await axios.delete(`${this.baseUrl}/instance/delete/${channelId}`, {
      headers: { apikey: this.apiKey }
    })
  }
}
```

#### Implementação: Z-API

```typescript
// apps/api/src/modules/channels/whatsapp/providers/zapi.provider.ts

export class ZApiProvider implements WhatsAppProvider {
  private baseUrl = process.env.ZAPI_BASE_URL!        // https://api.z-api.io
  private clientToken = process.env.ZAPI_CLIENT_TOKEN!

  private instanceUrl(channelId: string) {
    // channelId armazena: "instanceId:instanceToken" (separados por ":")
    const [instanceId, instanceToken] = channelId.split(':')
    return {
      url: `${this.baseUrl}/instances/${instanceId}/token/${instanceToken}`,
      instanceToken
    }
  }

  async createInstance(channelId: string) {
    // Na Z-API, instâncias são criadas no painel deles.
    // channelId é fornecido pelo usuário (instanceId:instanceToken)
    // Apenas configuramos o webhook
    const { url, instanceToken } = this.instanceUrl(channelId)
    await axios.put(`${url}/update-webhook-received`, {
      webhookReceivedDelivery: false,
      value: `${process.env.API_URL}/webhooks/whatsapp/${channelId}`
    }, { headers: { 'Client-Token': this.clientToken } })
  }

  async getQRCode(channelId: string): Promise<string> {
    const { url } = this.instanceUrl(channelId)
    const res = await axios.get(`${url}/qr-code/image`, {
      headers: { 'Client-Token': this.clientToken }
    })
    return res.data.value  // base64 da imagem
  }

  async getStatus(channelId: string) {
    const { url } = this.instanceUrl(channelId)
    const res = await axios.get(`${url}/status`, {
      headers: { 'Client-Token': this.clientToken }
    })
    if (res.data.connected) return 'connected'
    if (res.data.smartphoneConnected) return 'qr_required'
    return 'disconnected'
  }

  async sendText(channelId: string, to: string, text: string) {
    const { url } = this.instanceUrl(channelId)
    await axios.post(`${url}/send-text`, {
      phone: to, message: text
    }, { headers: { 'Client-Token': this.clientToken } })
  }

  async sendMedia(channelId: string, to: string, mediaUrl: string, caption?: string) {
    const { url } = this.instanceUrl(channelId)
    await axios.post(`${url}/send-image`, {
      phone: to, image: mediaUrl, caption
    }, { headers: { 'Client-Token': this.clientToken } })
  }

  async sendAudio(channelId: string, to: string, audioUrl: string) {
    const { url } = this.instanceUrl(channelId)
    await axios.post(`${url}/send-audio`, {
      phone: to, audio: audioUrl
    }, { headers: { 'Client-Token': this.clientToken } })
  }

  parseWebhook(payload: any): WhatsAppMessage | null {
    if (!payload.phone || payload.fromMe) return null
    return {
      from: payload.phone,
      name: payload.senderName || 'Desconhecido',
      text: payload.text?.message,
      mediaUrl: payload.image?.imageUrl || payload.audio?.audioUrl || payload.document?.documentUrl,
      mediaType: payload.type === 'ReceivedCallback' ? undefined : payload.type?.toLowerCase(),
      messageId: payload.messageId,
      timestamp: Math.floor(new Date(payload.momment).getTime() / 1000)
    }
  }

  async deleteInstance(channelId: string) {
    // Na Z-API, exclusão é feita pelo painel. Apenas removemos o webhook.
    const { url } = this.instanceUrl(channelId)
    await axios.put(`${url}/update-webhook-received`, {
      value: ''
    }, { headers: { 'Client-Token': this.clientToken } })
  }
}
```

#### Factory — seleção automática pelo env

```typescript
// apps/api/src/modules/channels/whatsapp/provider.factory.ts

import { EvolutionApiProvider } from './providers/evolution.provider'
import { ZApiProvider }         from './providers/zapi.provider'
import { WhatsAppProvider }     from './provider.interface'

export function getWhatsAppProvider(): WhatsAppProvider {
  const provider = process.env.WHATSAPP_PROVIDER || 'evolution'

  switch (provider) {
    case 'zapi':      return new ZApiProvider()
    case 'evolution': return new EvolutionApiProvider()
    default:
      throw new Error(`Provider WhatsApp desconhecido: "${provider}"`)
  }
}
```

#### Uso no serviço (nunca muda, independente do provider)

```typescript
// apps/api/src/modules/channels/whatsapp/whatsapp.service.ts

import { getWhatsAppProvider } from './provider.factory'

export class WhatsAppService {
  private provider = getWhatsAppProvider()  // troca automática via env

  async sendMessage(channelId: string, to: string, text: string) {
    await this.provider.sendText(channelId, to, text)
  }

  async getQRCode(channelId: string) {
    return this.provider.getQRCode(channelId)
  }

  parseIncomingWebhook(payload: unknown) {
    return this.provider.parseWebhook(payload)
  }
}
```

#### Variáveis de ambiente necessárias por provider

```bash
# Seleciona qual provider usar (trocar aqui é suficiente)
WHATSAPP_PROVIDER="evolution"   # ou "zapi"

# Evolution API (se WHATSAPP_PROVIDER=evolution)
EVOLUTION_API_URL="https://evolution.seu-dominio.com"
EVOLUTION_API_KEY="sua-chave-aqui"

# Z-API (se WHATSAPP_PROVIDER=zapi)
ZAPI_BASE_URL="https://api.z-api.io"
ZAPI_CLIENT_TOKEN="seu-client-token-aqui"
# Instância é informada pelo usuário no painel: "instanceId:instanceToken"
```

#### Como conectar no painel (UX)

```
Ao conectar canal WhatsApp, o sistema detecta o provider ativo e exibe:

[Se Evolution API]
  → Gera QR Code automaticamente
  → Usuário só escaneia

[Se Z-API]
  → Campo: "Instance ID" (ex: 12345ABCDE)
  → Campo: "Instance Token" (ex: token-gerado-no-painel-zapi)
  → Botão: Conectar → sistema valida + exibe QR Code
```

#### Adicionar novo provider no futuro

Para suportar um novo provider (ex: WPPConnect, Baileys próprio), basta:
1. Criar `apps/api/src/modules/channels/whatsapp/providers/novoProvider.provider.ts`
2. Implementar a interface `WhatsAppProvider`
3. Adicionar um `case` no `provider.factory.ts`
4. Atualizar `.env`: `WHATSAPP_PROVIDER="novoProvider"`

**Nenhuma outra parte do código precisa ser alterada.**

### 8.2 Meta API (Instagram + Facebook)

```typescript
// Webhook de verificação (GET)
GET /webhooks/meta/:channelId?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=XXX

// Webhook de mensagem (POST)
{
  object: "instagram",
  entry: [{
    id: "page_id",
    messaging: [{
      sender: { id: "user_id" },
      recipient: { id: "page_id" },
      timestamp: 1234567890,
      message: { mid: "msgId", text: "Olá!" }
    }]
  }]
}

// Enviar resposta
POST https://graph.facebook.com/v19.0/me/messages
Headers: { Authorization: "Bearer PAGE_ACCESS_TOKEN" }
Body: {
  recipient: { id: "user_id" },
  message: { text: "Olá! Como posso ajudar?" }
}
```

### 8.3 Telegram

```typescript
// Configurar webhook
POST https://api.telegram.org/bot{TOKEN}/setWebhook
Body: { url: "https://api.syncroflow.com/webhooks/telegram/{channelId}" }

// Webhook recebido
{
  update_id: 123,
  message: {
    message_id: 1,
    from: { id: 123, first_name: "João" },
    chat: { id: 123 },
    text: "Olá!"
  }
}

// Enviar mensagem
POST https://api.telegram.org/bot{TOKEN}/sendMessage
Body: { chat_id: 123, text: "Olá! Como posso ajudar?" }
```

---

## 9. Segurança

```
- Autenticação: JWT (access_token 15min) + refresh_token (httpOnly cookie, 7 dias)
- 2FA: TOTP via authenticator app (speakeasy library)
- Senhas: bcrypt com salt 12
- API Keys: SHA-256 hash armazenado, valor completo retornado apenas na criação
- Variáveis de ambiente: AES-256-GCM para criptografia em repouso
- Webhooks: validação de assinatura HMAC (Evolution API usa X-Api-Key, Meta usa X-Hub-Signature-256)
- Rate limiting: por IP (100 req/min) e por usuário (1000 req/min)
- CORS: apenas origens configuradas
- Helmet: headers de segurança
- Validação: Zod em todas as rotas
- Upload: validação de MIME type real (não só extensão), limite de 50MB
- SQL injection: impossível com Prisma (queries parametrizadas)
- XSS: sanitização de inputs, CSP headers
```

---

## 10. Variáveis de Ambiente (`.env`)

```bash
# Banco de dados
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."  # para Prisma migrations

# Redis
REDIS_URL="redis://..."

# JWT
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."

# Criptografia (variáveis de ambiente dos clientes)
ENCRYPTION_KEY="..."  # 32 bytes hex

# LLMs
ANTHROPIC_API_KEY="..."
OPENAI_API_KEY="..."

# Evolution API (WhatsApp)
EVOLUTION_API_URL="https://evolution.seu-dominio.com"
EVOLUTION_API_KEY="..."

# Meta (Instagram + Facebook)
META_APP_ID="..."
META_APP_SECRET="..."

# Supabase Storage
SUPABASE_URL="..."
SUPABASE_SERVICE_ROLE_KEY="..."

# Frontend
NEXT_PUBLIC_API_URL="https://api.syncroflow.com"
NEXT_PUBLIC_WS_URL="wss://api.syncroflow.com"

# Email (para confirmação de conta e reset de senha)
SMTP_HOST="..."
SMTP_PORT=587
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="noreply@syncroflow.com"

# Sentry
SENTRY_DSN="..."
```

---

## 11. Tour Interativo (Onboarding no Painel)

Após o primeiro login, exibir um tour guiado com tooltips (usando Shepherd.js ou Intro.js):

```
Passo 1 de 14 — Dashboard:
  "Acompanhe sua operação em tempo real. Aqui você acompanha em tempo real o consumo 
   de créditos e terá estatísticas detalhadas sobre os atendimentos."

Passo 2 de 14 — Agentes:
  "Crie e gerencie sua equipe de agentes. É aqui que tudo começa. Você cria, ajusta 
   e gerencia seus agentes de forma simples e rápida."

Passo 3 de 14 — Equipe:
  "Convide sua equipe humana. Você pode convidar sua equipe e definir os papéis de 
   cada membro. Seu agente pode precisar da colaboração da sua equipe."

Passo 4 de 14 — Canais:
  "Gerencie seus canais. Aqui você visualiza e gerencia os canais disponíveis na 
   sua conta. É o espaço que você vai acompanhar e organizar onde seus agentes podem atuar."

Passo 5 de 14 — Chat:
  "Acompanhe seus atendimentos. Gerencie e responda atendimentos em tempo real 
   junto dos seus agentes dentro da plataforma."

Passo 6 de 14 — Contatos:
  "Visão de contatos. Nesta área ficam registrados todos os contatos que já falaram 
   com seu atendimento."

Passo 7 de 14 — Mais opções:
  "Aqui você encontra recursos adicionais para expandir, organizar e personalizar 
   sua operação dentro da plataforma."

[demais passos: Base de conhecimento, Atendimentos, API, Faturamento, etc.]
```

---

## 12. Diferenciais do SyncroFlow vs Concorrentes

| Funcionalidade | GPTMaker | SyncroFlow |
|---|---|---|
| Escolha de LLM por agente | ❌ Fixo | ✅ Claude, GPT-4, Gemini |
| Base de conhecimento compartilhada | ❌ Por agente | ✅ Global, multi-agente |
| Servidores MCP nativos | ✅ Sim | ✅ Sim + custom |
| Variáveis de ambiente seguras | ❌ Não | ✅ Criptografadas |
| RAG inteligente (timing) | Beta | ✅ Nativo |
| Planos com desconto anual | ✅ -10% | ✅ -5%/-7%/-10% progressivo |
| 2FA | ❌ Não | ✅ TOTP |
| Webhook de eventos do sistema | Básico | ✅ Configurável por agente |
| Widget open source | ❌ | ✅ Customizável |
| API completa com documentação | ✅ | ✅ OpenAPI/Swagger |
| Exportação de atendimentos | ❌ | ✅ CSV |
| Custo por atendimento (analytics) | ❌ | ✅ |
| Taxa de resolução pela IA | ❌ | ✅ |
| NPS/CSAT integrado | ❌ | ✅ (roadmap) |

---

## 13. Ordem de Implementação (MVP → Produto)

### Fase 1 — MVP (semanas 1-6)
- [ ] Setup do projeto (monorepo, TypeScript, Prisma, Fastify, Next.js)
- [ ] Autenticação completa (registro, login, refresh, logout, 2FA)
- [ ] CRUD de agentes com wizard de criação
- [ ] Treinamentos (texto, website, documento) com processamento via queue
- [ ] RAG básico (pgvector + busca semântica)
- [ ] Integração WhatsApp via Evolution API
- [ ] Chat ao vivo (Socket.io)
- [ ] Dashboard básico (KPIs principais)
- [ ] Deploy no Railway (backend) + Vercel (frontend)

### Fase 2 — Expansão (semanas 7-12)
- [ ] Onboarding wizard completo
- [ ] Instagram e Facebook Messenger
- [ ] Telegram
- [ ] Widget de chat para sites
- [ ] Intenções com webhook
- [ ] Base de conhecimento global compartilhada
- [ ] Configurações avançadas do agente (todas as abas)
- [ ] Módulo de Contatos completo
- [ ] Atendimentos com histórico e exportação
- [ ] Gerenciamento de equipe (convites, papéis)
- [ ] Analytics completo (todas as métricas)

### Fase 3 — Produto Completo (semanas 13-20)
- [ ] Servidores MCP
- [ ] Integrações (ElevenLabs, Google Calendar, Shopify, Stripe, Paypal)
- [ ] Variáveis de ambiente criptografadas
- [ ] Multi-LLM (seletor de modelo por agente)
- [ ] Faturamento com Stripe (planos, créditos extras, notas fiscais)
- [ ] API pública com documentação Swagger
- [ ] Tour interativo completo
- [ ] Multi-workspace
- [ ] Notificações push
- [ ] NPS/CSAT integrado

---

## 14. Comandos para Iniciar o Projeto

```bash
# Clonar e instalar
git clone https://github.com/seu-usuario/syncroflow
cd syncroflow
npm install

# Configurar ambiente
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# preencher as variáveis

# Subir dependências locais
docker-compose up -d  # PostgreSQL + Redis

# Rodar migrations
cd apps/api
npx prisma migrate dev

# Iniciar desenvolvimento
npm run dev  # inicia api + web simultaneamente (turbo)

# Build para produção
npm run build
```

---

*Documento gerado em Maio 2026. Baseado na análise completa de 56 telas do GPTMaker.ai como referência de mercado — todas as funcionalidades do SyncroFlow foram repensadas e expandidas para superar o concorrente.*

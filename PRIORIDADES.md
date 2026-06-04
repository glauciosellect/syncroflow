# SyncroFlow — Roadmap de Melhorias e Novas Funcionalidades
> Documento de trabalho — atualizado em Junho 2026  
> Legenda: ✅ Concluído | 🔄 Em andamento | ⏳ Pendente | 🔒 Bloqueado

---

## Status Atual do Sistema

| Módulo | Status |
|--------|--------|
| Autenticação (login, 2FA, refresh) | ✅ Completo |
| Agentes (CRUD, wizard, configurações) | ✅ Completo |
| Treinamentos (texto, website, documento) | ⚠️ Parcial |
| Canais (WhatsApp, Instagram, Telegram, Widget) | ✅ Completo |
| Chat ao vivo (inbox) | ✅ Completo |
| Contatos | ✅ Completo |
| Intenções (webhook) | ✅ Completo |
| Equipe (Workspace Members) | ⚠️ Parcial — falta convite por email |
| Dashboard / Analytics | ⚠️ Parcial |
| Faturamento | ⚠️ Parcial |
| **Comercial (Leads / Pipeline / Follow-up)** | ❌ Não existe |
| **Primeiro Atendimento (agente)** | ❌ Não existe |

---

## BLOCO 1 — Correções e Finalizações Existentes

### 1.1 — Equipe: Convite de Membros por E-mail
**Prioridade:** Alta  
**Complexidade:** Média

**O que fazer:**
- [ ] Backend: implementar `POST /workspaces/me/members/invite`
  - Recebe `{ email, role: "ADMIN" | "AGENT" }`
  - Gera token de convite com expiração de 7 dias
  - Envia e-mail com link: `https://app.syncroflow.com/invite?token=xxx`
  - Armazena convite pendente (nova tabela `WorkspaceInvite`)
- [ ] Backend: implementar `POST /auth/invite/accept`
  - Valida token
  - Se usuário existe: adiciona ao workspace
  - Se não existe: redireciona para cadastro e depois aceita
- [ ] Frontend: botão "Convidar membro" na página `/team`
  - Modal com campo de e-mail + seletor de papel (ADMIN / AGENT)
  - Lista de convites pendentes (badge "Aguardando") junto com membros ativos
  - Opção de reenviar convite ou cancelar

**Schema necessário:**
```prisma
model WorkspaceInvite {
  id          String     @id @default(cuid())
  workspaceId String
  email       String
  role        MemberRole @default(AGENT)
  token       String     @unique
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime   @default(now())
  workspace   Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}
```

---

### 1.2 — Treinamento por Website: Crawling Recursivo Real
**Prioridade:** Alta  
**Complexidade:** Média

**Diagnóstico atual:**  
O sistema JÁ faz scraping de uma única URL (axios + cheerio). O campo `crawl: boolean` é recebido na rota e enviado à fila, mas **nunca é utilizado no worker** — é um stub incompleto. O usuário vê a opção de crawling mas ela não funciona.

**O que fazer:**
- [ ] Implementar crawling recursivo no `training.worker.ts` quando `crawl = true`:
  - Extrair todos os links internos da página inicial via cheerio
  - Filtrar apenas links do mesmo domínio (sem links externos)
  - Respeitar `robots.txt` do domínio
  - Limitar a máximo 50 páginas por domínio (controle de consumo)
  - Processar cada página e armazenar chunks separados por URL-origem
- [ ] Exibir progresso no frontend: "Processando página 3 de 12..."
- [ ] Adicionar botão de re-processar URL no treinamento existente

**Nota técnica:**  
Sites com conteúdo carregado por JavaScript (SPAs React/Angular) não são capturados com axios+cheerio. Documentar essa limitação ao usuário na UI. Puppeteer/Playwright fica para fase futura.

---

### 1.3 — Treinamento por Vídeo: Implementar Processamento
**Prioridade:** Média  
**Complexidade:** Alta

**Diagnóstico atual:**  
A rota existe, o banco aceita, a fila recebe o job — mas o worker **não processa vídeo** (cai no bloco `else` sem fazer nada). A funcionalidade aparece na UI mas falha silenciosamente.

**O que fazer:**
- [ ] Integrar API de transcrição: OpenAI Whisper ou AssemblyAI
- [ ] Para YouTube: extrair legenda automática via `ytdl-core` ou `youtube-dl`
- [ ] Processar transcrição em chunks e gerar embeddings (mesmo fluxo do texto)
- [ ] Exibir duração estimada de processamento no frontend
- [ ] Tratar erro quando vídeo não tem legenda disponível

---

## BLOCO 2 — Agentes: Primeiro Atendimento

### 2.1 — Mensagem de Primeiro Contato
**Prioridade:** Alta  
**Complexidade:** Média

**Conceito:**  
Quando um lead entra em contato pela **primeira vez** com um agente, antes de qualquer resposta contextualizada, o agente envia automaticamente um conteúdo de boas-vindas pré-configurado (texto, vídeo, documento ou combinação). Somente após esse envio o agente começa a responder normalmente com base em comportamento, treinamentos e intenções.

**Fluxo completo:**
```
Lead manda 1ª mensagem
       ↓
Sistema verifica: é o primeiro contato deste lead com este agente?
       ↓ SIM
Agente envia conteúdo de primeiro atendimento:
  → Texto de boas-vindas  (se preenchido)
  → Vídeo de apresentação (se configurado)
  → Documento/PDF         (se configurado)
       ↓
Lead responde ou escreve algo
       ↓
A partir daqui: comportamento normal do agente (RAG, intenções, COMPORTAMENTO)
```

**Schema — campos a adicionar em `AgentConfig`:**
```prisma
firstContactEnabled   Boolean  @default(false)
firstContactText      String?  @db.Text   // texto de boas-vindas
firstContactVideoUrl  String?             // URL do vídeo
firstContactFileUrl   String?             // URL do documento
firstContactFileName  String?
```

**Backend — o que fazer:**
- [ ] Migration para adicionar campos ao `AgentConfig`
- [ ] No worker de processamento de mensagem: verificar se é o primeiro contato
  - Campo `firstContactSentAt` no JSON `variables` do `Contact` por agente
  - Ex: `{ "firstContactSentAt_agentId": "2026-06-04T10:00:00Z" }`
- [ ] Se `firstContactEnabled = true` e é o primeiro contato: enviar o conteúdo ANTES de processar com a IA
- [ ] Rota PATCH `/agents/:id/config` já aceita — apenas adicionar os novos campos na validação Zod

**Frontend — aba Perfil do agente:**
- [ ] Nova seção "Primeiro Atendimento" abaixo das informações pessoais
```
[ ] Ativar mensagem de primeiro contato

Texto de boas-vindas:
[textarea — "Olá! Seja bem-vindo à nossa clínica..."]

Vídeo de apresentação (opcional):
[input URL ou botão de upload]

Documento para enviar (opcional):
[upload drag & drop — PDF, DOCX]

[Salvar]
```

---

## BLOCO 3 — Menu COMERCIAL (novo módulo)

### Visão Geral
Novo item no menu lateral na seção `COMUNICAÇÃO`:

```
[seção: COMUNICAÇÃO]
  💬 Chat
  📋 Contatos
  💼 Comercial  ← NOVO
```

Ao clicar, abre sub-menu ou página com 3 áreas:  
**Leads | Pipeline | Follow-up**

O módulo Comercial transforma o SyncroFlow em uma ferramenta de **CRM + automação de vendas**, integrando o comportamento dos agentes de IA com o acompanhamento de oportunidades.

---

### 3.1 — Leads
**Prioridade:** Alta  
**Complexidade:** Média

**Conceito:**  
Todo contato que interage com um agente pode ser convertido em Lead. Leads têm status, origem, valor estimado e responsável.

**Schema:**
```prisma
model Lead {
  id             String     @id @default(cuid())
  workspaceId    String
  contactId      String?
  agentId        String?
  name           String
  email          String?
  phone          String?
  source         LeadSource @default(ORGANIC)
  status         LeadStatus @default(NEW)
  stage          String?    // nome do estágio no pipeline
  estimatedValue Decimal?
  notes          String?    @db.Text
  assignedToId   String?    // membro responsável
  convertedAt    DateTime?
  lostAt         DateTime?
  lostReason     String?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  workspace  Workspace      @relation(...)
  contact    Contact?       @relation(...)
  agent      Agent?         @relation(...)
  activities LeadActivity[]
  followUps  FollowUp[]
}

model LeadActivity {
  id          String   @id @default(cuid())
  leadId      String
  type        String   // "stage_changed" | "note_added" | "follow_up_sent" | "converted" | "lost"
  description String
  userId      String?
  createdAt   DateTime @default(now())
  lead        Lead     @relation(...)
}

enum LeadSource {
  WHATSAPP
  INSTAGRAM
  FACEBOOK
  TELEGRAM
  WIDGET
  MANUAL
  ORGANIC
}

enum LeadStatus {
  NEW
  IN_PROGRESS
  CONVERTED
  LOST
}
```

**Rotas da API:**
```
GET    /leads                  — listar (filtros: status, agente, origem, período, responsável)
POST   /leads                  — criar lead manualmente
GET    /leads/:id              — detalhes + atividades + follow-ups
PATCH  /leads/:id              — atualizar
DELETE /leads/:id              — excluir
POST   /leads/:id/convert      — marcar como convertido
POST   /leads/:id/lose         — marcar como perdido (body: { reason })
GET    /leads/export           — exportar CSV
```

**Frontend:**
- Tabela de leads com colunas: Nome | Origem | Agente | Etapa | Valor | Responsável | Status | Data
- Filtros: status, origem, agente, responsável, período
- Botão "+ Novo Lead" (criação manual)
- Click na linha: abre detalhe com timeline de atividades + follow-ups
- Botão "Converter em Lead" no detalhe de qualquer Contato

---

### 3.2 — Pipeline (Kanban)
**Prioridade:** Alta  
**Complexidade:** Alta

**Conceito:**  
Visualização Kanban dos leads por etapas configuráveis do funil de vendas.

**Schema:**
```prisma
model Pipeline {
  id          String   @id @default(cuid())
  workspaceId String
  name        String   @default("Pipeline de Vendas")
  createdAt   DateTime @default(now())

  stages    PipelineStage[]
  workspace Workspace       @relation(...)
}

model PipelineStage {
  id         String   @id @default(cuid())
  pipelineId String
  name       String   // "Prospecção", "Proposta", "Negociação", "Fechamento"
  color      String   @default("#6366f1")
  order      Int
  createdAt  DateTime @default(now())

  pipeline Pipeline @relation(...)
}
```

**Etapas padrão criadas automaticamente no primeiro acesso:**
`Novo → Em Contato → Proposta Enviada → Negociação → Fechado Ganho → Fechado Perdido`

**Rotas da API:**
```
GET    /pipelines                    — listar pipelines
POST   /pipelines                    — criar pipeline
PATCH  /pipelines/:id/stages         — atualizar etapas (ordem, nomes, cores)
PATCH  /leads/:id/stage              — mover lead para outra etapa
GET    /pipelines/:id/leads          — leads agrupados por etapa (para kanban)
```

**Frontend:**
- Board Kanban com colunas drag-and-drop (library: `@dnd-kit/core`)
- Cards de lead: nome | valor estimado | agente | ícone do canal | responsável | dias na etapa
- Valor total acumulado no rodapé de cada coluna
- Filtros globais no kanban: por agente, por responsável, por origem
- Configuração de etapas: adicionar, renomear, reordenar, alterar cor, excluir
- Ao mover card: registrar `LeadActivity` com `type: "stage_changed"`

---

### 3.3 — Follow-up
**Prioridade:** Alta  
**Complexidade:** Alta

**Conceito:**  
Sistema de lembretes e automações para retomar contato com leads. Pode ser manual (agendado por humano) ou automático (disparado por regras ou sequências programadas — drip).

**Tipos de Follow-up:**

| Tipo | Disparador | Ação |
|------|-----------|------|
| **Manual** | Humano agenda | Lembrete + notificação para o responsável |
| **Auto por inatividade** | Lead X dias sem responder | IA envia mensagem de reativação via canal |
| **Auto por etapa** | Lead X dias na mesma etapa | Notificar responsável ou enviar mensagem |
| **Sequencial (drip)** | Lead entra no funil | Sequência de mensagens: dia 1, dia 3, dia 7, dia 14 |

**Schema:**
```prisma
model FollowUp {
  id           String         @id @default(cuid())
  workspaceId  String
  leadId       String?
  contactId    String?
  agentId      String?
  type         FollowUpType
  status       FollowUpStatus @default(PENDING)
  scheduledAt  DateTime
  executedAt   DateTime?
  message      String?        @db.Text
  fileUrl      String?
  notes        String?        @db.Text   // nota interna para o humano
  assignedToId String?
  createdAt    DateTime       @default(now())

  workspace Workspace @relation(...)
  lead      Lead?     @relation(...)
  contact   Contact?  @relation(...)
  agent     Agent?    @relation(...)
}

model Drip {
  id          String   @id @default(cuid())
  workspaceId String
  agentId     String
  name        String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  steps DripStep[]
  agent Agent      @relation(...)
}

model DripStep {
  id        String   @id @default(cuid())
  dripId    String
  order     Int
  delayDays Int      // enviar X dias após etapa anterior
  message   String   @db.Text
  fileUrl   String?
  createdAt DateTime @default(now())

  drip Drip @relation(...)
}

enum FollowUpType {
  MANUAL
  AUTO_MESSAGE
  DRIP_SEQUENCE
}

enum FollowUpStatus {
  PENDING
  SENT
  FAILED
  CANCELLED
  DONE
}
```

**Rotas da API:**
```
GET    /follow-ups                   — listar (filtros: status, tipo, agente, data)
POST   /follow-ups                   — criar follow-up manual
PATCH  /follow-ups/:id               — atualizar
DELETE /follow-ups/:id               — cancelar
POST   /follow-ups/:id/done          — marcar como concluído (manual)

GET    /drips                        — listar sequências
POST   /drips                        — criar sequência
GET    /drips/:id                    — detalhes + etapas
PATCH  /drips/:id                    — atualizar
DELETE /drips/:id                    — excluir
POST   /leads/:id/drip/:dripId       — iniciar sequência para um lead
```

**Worker BullMQ — Job recorrente a cada 5 minutos:**
```
Buscar FollowUp com status=PENDING e scheduledAt <= now()
Para cada um:
  → AUTO_MESSAGE:   enviar via canal do lead/contato (Evolution API, Telegram, etc.)
  → MANUAL:         enviar notificação push + email para assignedTo
  → DRIP_SEQUENCE:  enviar mensagem e agendar próximo DripStep
Atualizar status: SENT ou FAILED
Registrar LeadActivity
```

**Frontend — Página Follow-up:**
```
Header: "Follow-up" + botão "+ Agendar"

Duas abas:
  [Lembretes]   — follow-ups manuais
  [Automações]  — sequências drip

Aba Lembretes:
  Lista: lead/contato | data agendada | nota | responsável | status
  Ações: [Marcar feito] [Editar] [Cancelar]
  Filtros: status, responsável, período

Aba Automações (Drip):
  Lista de sequências: nome | agente | nº etapas | leads ativos | [toggle ativo]
  Botão "+ Nova sequência"
  
  Modal de criação/edição de sequência:
    Nome da sequência
    Agente responsável pelo envio
    Builder de etapas:
      [Dia 1] [textarea mensagem] [upload arquivo opcional] [remover]
      [Dia 3] [textarea mensagem] [upload arquivo opcional] [remover]
      [+ Adicionar etapa]
    [Salvar]
```

**Notas sobre LGPD e WhatsApp Policy:**
- Toda mensagem automática deve ter opt-out claro: "Responda PARAR para não receber mais"
- Drip funciona nativamente dentro da janela de 24h do WhatsApp
- Fora da janela: necessário template aprovado pela Meta (via Evolution API)
- Respeitar horário comercial configurado no agente

---

## BLOCO 4 — Dashboard: Integração com Módulo Comercial

### 4.1 — Novos Cards KPI
**Prioridade:** Média

Adicionar à aba "Visão Geral" do Dashboard:
- [ ] **Total de Leads** — captados no período (com % vs período anterior)
- [ ] **Taxa de Conversão** — leads convertidos / total (%)
- [ ] **Valor em Pipeline** — soma de `estimatedValue` dos leads ativos (R$)
- [ ] **Follow-ups Pendentes** — quantidade aguardando execução hoje

### 4.2 — Novos Gráficos
- [ ] **Leads por origem** — pizza: WhatsApp, Instagram, Manual, etc.
- [ ] **Funil de conversão** — barras: volume por etapa do pipeline
- [ ] **Follow-ups por semana** — linha: enviados vs concluídos
- [ ] **Taxa de resposta** — % de leads que responderam a follow-ups automáticos

### 4.3 — Novas Rotas de Analytics
```
GET /analytics/leads        — totais, taxa de conversão, top agentes captadores
GET /analytics/pipeline     — leads por etapa, valor por etapa, tempo médio por etapa
GET /analytics/follow-ups   — enviados, taxa de resposta, mais efetivos
```

---

## BLOCO 5 — Melhorias Adicionais Identificadas

### 5.1 — Notificações em Tempo Real (sino da topbar)
**Prioridade:** Média

O sino existe na UI mas não faz nada. Implementar via Socket.io:
- [ ] Novo lead captado automaticamente pelo agente
- [ ] Follow-up manual pendente para hoje (aviso às 9h)
- [ ] Conversa transferida para humano (aguardando atendimento)
- [ ] Membro convidado aceitou o convite
- [ ] Créditos abaixo de 20% do limite do plano

### 5.2 — Conversão Automática de Contato em Lead (via Intenção)
**Prioridade:** Média

Quando o agente detecta uma intenção marcada como "comercial", criar o lead automaticamente.

Configuração na aba Configurações do agente, nova sub-aba "Comercial":
```
[ ] Criar lead automaticamente ao detectar intenção comercial
Etapa inicial no pipeline: [dropdown]
Valor estimado padrão: [campo numérico opcional]
```

### 5.3 — Exportação
- [ ] Leads: exportar CSV com filtros ativos
- [ ] Pipeline: relatório por etapa com valores acumulados

---

## Ordem de Implementação Sugerida

| # | Tarefa | Bloco | Estimativa |
|---|--------|-------|------------|
| 1 | Equipe: convite por e-mail | 1.1 | 1 semana |
| 2 | Website: crawling recursivo | 1.2 | 1 semana |
| 3 | Agente: Primeiro Atendimento | 2.1 | 1 semana |
| 4 | Schema Comercial no Prisma (migration) | 3 | 0,5 semana |
| 5 | Leads: backend + frontend | 3.1 | 1,5 semana |
| 6 | Pipeline Kanban: backend + frontend | 3.2 | 2 semanas |
| 7 | Follow-up manual: backend + frontend | 3.3 | 1,5 semana |
| 8 | Drip Sequence: builder + worker | 3.3 | 2 semanas |
| 9 | Dashboard: novos cards e gráficos | 4 | 1 semana |
| 10 | Notificações em tempo real | 5.1 | 1 semana |
| 11 | Conversão automática de lead | 5.2 | 1 semana |
| 12 | Vídeo: transcrição e processamento | 1.3 | 2 semanas |

**Total estimado: ~16 semanas de desenvolvimento**

---

*Documento gerado em Junho 2026 com base na análise do código atual e nas solicitações de produto.*

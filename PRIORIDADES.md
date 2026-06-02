# SyncroFlow — Roadmap de Execução

> Atualizado em: 01/06/2026
> Legenda: ✅ Concluído | 🔄 Em andamento | ⏳ Pendente | 🔒 Bloqueado

---

## P0 — SyncroLex: Substituir N8N pelo SyncroFlow (URGENTE)

> **Objetivo:** Retirar agente N8N do SyncroLex, adicionar toggle de Agente de Atendimento e conectar ao SyncroFlow.

- ✅ Remover referência ao N8N do fluxo de WhatsApp (`IntegracaoWhatsapp.tsx`)
- ✅ Criar card "SyncroFlow — Agente de Atendimento" em Configurações → Integrações
- ✅ Toggle ativar/desativar agente dentro do card SyncroFlow
- ✅ Formulário para colar API Key + Workspace ID do SyncroFlow
- ✅ Server actions `saveSyncroflowConfig` e `toggleSyncroflowAtivo` no banco
- ✅ SyncroFlow aparece no sumário de integrações com status verde/vermelho
- ⏳ Webhook: quando SyncroFlow cria agendamento → salvar na Agenda do SyncroLex (P1 depende do Google Calendar)

---

## P1 — Google Calendar: Agente agenda consultas

> **Objetivo:** Agente consegue criar, consultar e cancelar eventos no Google Calendar via linguagem natural.

- ✅ Adicionar `CALENDAR` ao enum `IntentionAction` no schema Prisma + `prisma db push`
- ✅ Criar `calendar.service.ts` com `scheduleAppointment`, `listUpcomingAppointments`, `cancelAppointment`, `getAgendaContextForPrompt`
- ✅ `message.worker.ts` trata intentions `CALENDAR` (ações: SCHEDULE / LIST / CANCEL)
- ✅ Contexto da agenda dos próximos 7 dias injetado no system prompt do agente automaticamente
- ⏳ Criar intentions CALENDAR no painel do SyncroFlow (SCHEDULE / LIST / CANCEL) — fazer via UI
- ⏳ Webhook: agendamentos do SyncroFlow → Agenda do SyncroLex (depende da integração P0 SyncroLex)

---

## P2 — Leitura de Imagem, PDF e Documentos

> **Objetivo:** Agente interpreta arquivos enviados pelo usuário no WhatsApp.

- ✅ Imagem: análise visual via Claude Vision com preservação do mimetype real (JPEG/PNG/WebP/GIF)
- ✅ Imagem de documento (RG, CPF, comprovante, boleto): Claude extrai e lista todas as informações
- ✅ PDF: envia como base64 direto para Claude (suporte nativo), extrai e resume o conteúdo
- ✅ Word (.docx): instalar `mammoth` → extrai texto → Claude resume
- ✅ Mimetype real do UAZAPI passado corretamente para `processIncomingMedia`
- ✅ TypeScript compila sem erros (0 erros)

---

## P3 — Resposta em Áudio com Voz JARVIS

> **Objetivo:** Quando recebe áudio, perguntar preferência e responder em voz tipo JARVIS.

- ✅ Ao receber áudio: pergunta "Prefere que eu responda em *áudio* ou *texto*?"
- ✅ Preferência salva em `contact.variables.audioPreference` (`audio` | `text`)
- ✅ Resposta "áudio" ou "texto" do contato ativa a preferência e confirma
- ✅ `tts.service.ts`: OpenAI TTS voz `onyx` (grave, robótica, tom JARVIS)
- ✅ Suporte opcional a ElevenLabs (`ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`) para voz JARVIS real
- ✅ Áudio enviado via UAZAPI `sendAudioBase64` — sem necessidade de hosting externo
- ✅ Fallback para texto se TTS falhar
- ✅ TypeScript: 0 erros de compilação

---

## P4 — Stripe: Pagamentos e Trial

> **Objetivo:** Finalizar fluxo de venda na landing page e dentro do sistema após trial de 14 dias.

- ✅ `POST /billing/subscribe` — Stripe Checkout Session para assinatura recorrente (todos os planos e ciclos)
- ✅ `POST /billing/portal` — portal Stripe para trocar cartão, cancelar, ver faturas
- ✅ Webhooks: `checkout.session.completed` (créditos avulsos + ativa plano imediatamente)
- ✅ Webhooks: `customer.subscription.created/updated` → atualiza plan + credita no período
- ✅ Webhooks: `invoice.paid` → renova créditos mensais automaticamente
- ✅ Webhooks: `customer.subscription.deleted` → rebaixa para TRIAL
- ✅ Webhooks: `invoice.payment_failed` → registra fatura como falhou
- ✅ `billing/page.tsx`: botão "Assinar agora" chama API real, sem `alert()`
- ✅ `billing/page.tsx`: banner de trial expirado, link portal Stripe, renovação do plano
- ✅ `layout.tsx`: bloqueio total quando trial expirado — banner vermelho + tela de "Acesso suspenso"
- ✅ `.env.example`: variáveis Stripe + Price IDs opcionais documentados
- ✅ TypeScript: 0 erros de compilação
- ✅ Produtos e prices criados no Stripe (conta real, chave test)
- ✅ Planos renomeados: BASIC→STARTER, STANDARD→PRO, CORPORATE→BUSINESS (schema + banco + código)
- ✅ Preços corretos: Starter R$60 / Pro R$147 / Business R$439 (mensal) e R$53/130/387 (anual -12%)
- ✅ Price IDs salvos no `.env`: `STRIPE_PRICE_STARTER_MONTHLY`, etc.
- ✅ Créditos avulsos: 4 pacotes (500 / 2.000 / 5.000 / 15.000) com recarga imediata ao pagar
- ✅ Landing page: preços, agentes e desconto anual atualizados
- ⏳ Configurar `STRIPE_WEBHOOK_SECRET` no `.env` após criar o endpoint no Stripe Dashboard
- ⏳ Trocar chave `sk_test_` por `sk_live_` quando for para produção

---

## P5 — Chat Interno

> **Objetivo:** Chat interno funcional com envio real pelo WhatsApp e notificações.

- ✅ Decisão: manter chat interno (já tem lista, filtros, mensagens em tempo real, painel de contato)
- ✅ `POST /conversations/:id/messages` envia a mensagem pelo WhatsApp/Telegram/Facebook real
- ✅ Schema: campo `unreadCount` no Conversation + sincronizado no banco
- ✅ `message.worker.ts`: incrementa `unreadCount` ao chegar mensagem USER
- ✅ `GET /conversations/:id`: zera `unreadCount` ao abrir a conversa
- ✅ Frontend: badge azul com contagem de não lidas por conversa na lista
- ✅ Frontend: texto em negrito na conversa com mensagens novas
- ✅ Frontend: beep suave ao chegar mensagem nova em conversa não aberta
- ✅ TypeScript: 0 erros de compilação

---

## P6 — Integrações: Limpeza + ElevenLabs ativo

> **Objetivo:** Deixar apenas as integrações reais — Google Calendar e ElevenLabs. MCP adiado para fase 2.

- ✅ Removido: Shopify e Stripe "em breve" da página de Integrações
- ✅ ElevenLabs: card funcional com campos API Key + Voice ID (salvo criptografado no banco)
- ✅ `elevenLabsKey` e `elevenLabsVoiceId` adicionados ao schema Workspace + banco
- ✅ Rotas `/integrations/google` e `/integrations/elevenlabs` no workspace
- ✅ `tts.service.ts`: busca chave ElevenLabs do workspace (salva pelo usuário) em vez de .env
- ✅ `generateSpeech` recebe `workspaceId` e usa a voz configurada pelo advogado/cliente
- ✅ `BillingTab` em settings: planos/preços corretos, Assinar real, créditos avulsos atualizados
- ✅ TypeScript: 0 erros API e web

---

## P7 — CRM NuClick (por último)

> **Objetivo:** Painel central para controlar e administrar a venda de todos os sistemas.

- ⏳ Dashboard com todos os clientes (SyncroFlow + SyncroLex + futuros)
- ⏳ Controle de plano, pagamento, trial e status de cada workspace
- ⏳ Iniciar somente após P0–P6 concluídos

---

## Histórico de Conclusões

| Data | Item | Descrição |
|------|------|-----------|
| —    | —    | —         |

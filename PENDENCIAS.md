# Pendências SyncroFlow

## Bloqueado por aprovação externa (Meta)

### WhatsApp / Instagram / Facebook
- Status: código 100% pronto e migrado para Meta Cloud API oficial (UazAPI removida em 21/06/2026).
- Bloqueio: "Análise do app" enviada em 20/06/2026, prazo de resposta até ~20 dias (~10/07/2026).
- Sem essa aprovação, a Meta não libera o `config_id` do WhatsApp Embedded Signup — sem ele, nenhum cliente consegue conectar um número de WhatsApp pelo painel (erro: "este app precisa pelo menos de uma supported permission").
- Mesma aprovação cobre as permissões de Instagram e Facebook Messenger.
- Canal "NuClick" ficou sem WhatsApp funcionando desde a migração — decisão aceita pelo usuário.
- **Ação**: verificar status em developers.facebook.com/apps/4505201496393876 → Analisar → Análise do app. Quando aprovar: preencher `NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID` (Vercel + .env.local), redeploy, reconectar canais.

## Não testado / não confiável

### LinkedIn
- Status: código existe (criar canal, webhook, envio) mas **nunca foi validado contra a API real**.
- Problema 1: o envio de mensagem (`message.worker.ts`) usa um formato interno do LinkedIn (`com.linkedin.voyager.messaging.MessagingMember`) que parece ter sido copiado de engenharia reversa do site, não da documentação oficial pública.
- Problema 2: a LinkedIn Messaging API real é restrita a parceiros aprovados ("LinkedIn Marketing Developer Platform") — processo de aprovação separado da Meta, que a NuClick não solicitou ainda.
- Risco: se um cliente conectar hoje com um token válido de um app comum (não-parceiro), o envio provavelmente falha silenciosamente (401/403 em background job, sem feedback claro pro usuário).
- **Ação necessária**: (a) decidir se vale solicitar parceria oficial com LinkedIn, (b) ou remover/escondar a opção da UI até validar de verdade, (c) ou no mínimo adicionar aviso "beta/experimental" antes de qualquer cliente usar.

## Funcionando hoje, sem bloqueio

### Telegram
- Status: 100% funcional para texto (conectar bot, IA responde, atendente responde manualmente, créditos, histórico).
- Limitação conhecida: não suporta mídia (áudio/imagem/vídeo) nem para enviar nem para receber — só texto.
- Sem dependência de aprovação externa (Bot API do Telegram é pública).

### Email (Gmail) — implementado em 23/06/2026
- Status: conexão via OAuth Gmail, polling a cada 5 min, IA responde mantendo a thread (In-Reply-To/References). Filtro por lista de remetentes/domínios permitidos (`Channel.config.allowedSenders`) — sem isso cadastrado, nenhum e-mail é respondido.
- Requer escopo Gmail (`gmail.readonly`, `gmail.send`, `gmail.modify`) habilitado no OAuth Consent Screen do Google Cloud Console — **verificar se precisa de nova revisão/verificação do app pelo Google** (apps em produção com escopos sensíveis do Gmail podem exigir verificação de segurança do Google, processo que leva dias/semanas).
- Gaps conhecidos, não implementados: anexos de e-mail (PDF/imagem), Outlook/Microsoft 365, push notification em tempo real (Gmail Pub/Sub — só polling), e-mails HTML complexos podem extrair texto malformado.
- **Ação necessária**: testar end-to-end com uma conta Gmail real antes de divulgar a funcionalidade; confirmar no Google Cloud Console se o app precisa de verificação para os escopos Gmail em produção.

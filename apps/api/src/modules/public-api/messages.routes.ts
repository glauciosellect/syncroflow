import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'

// API pública de envio transacional de WhatsApp — para sistemas parceiros
// (ex: GestorAMA) mandarem mensagem via template aprovado pela Meta sem
// precisar de conversa/atendimento em andamento no painel. Autenticado por
// API Key (Bearer sf_...), não por sessão de usuário.
//
// Genérico por design: qualquer cliente SyncroFlow que precise disparar
// confirmação/lembrete transacional usa o mesmo endpoint — a lógica de
// "quando" e "para quem" disparar fica no sistema parceiro, este endpoint
// só envia.
export async function publicMessageRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticateApiKey)

  app.post('/api/messages/send-template', async (req, reply) => {
    const workspaceId = (req as any).workspaceId as string
    const { to, templateName, languageCode, params, channelId, codigoBotao } = z.object({
      to: z.string().min(8),
      templateName: z.string(),
      languageCode: z.string(),
      params: z.array(z.string()).optional(),
      channelId: z.string().optional(),
      // Código para o botão "Copiar código" de templates de Autenticação (ex.: portal do cliente SyncroLex)
      codigoBotao: z.string().max(15).optional(),
    }).parse(req.body)

    const channel = channelId
      ? await prisma.channel.findFirst({ where: { id: channelId, workspaceId, type: 'WHATSAPP', isActive: true } })
      : await prisma.channel.findFirst({ where: { workspaceId, type: 'WHATSAPP', isActive: true } })
    if (!channel) return reply.status(400).send({ error: 'Nenhum canal de WhatsApp ativo encontrado' })

    const provider = getWhatsAppProvider()
    if (!provider.sendTemplate) {
      return reply.status(400).send({ error: 'Provider atual não suporta envio de templates' })
    }

    try {
      const wamid = await provider.sendTemplate(channel.id, to, templateName, languageCode, params, codigoBotao)
      return reply.status(200).send({ sent: true, messageId: wamid })
    } catch (err: any) {
      const metaError = err?.response?.data?.error
      const errorMessage = metaError?.message || err?.message || 'Falha desconhecida ao enviar template'
      req.log.error({ templateName, metaCode: metaError?.code, metaSubcode: metaError?.error_subcode, errorMessage }, 'send-template falhou')
      // Recusa da Meta (4xx) volta como 422: o proxy do EasyPanel troca o corpo de qualquer 5xx por uma
      // página HTML, escondendo o motivo de quem chama a API. Falha de rede/infra continua 502.
      const recusadaPelaMeta = Boolean(metaError) && err?.response?.status >= 400 && err?.response?.status < 500
      return reply.status(recusadaPelaMeta ? 422 : 502).send({ sent: false, error: errorMessage, code: metaError?.code })
    }
  })
}

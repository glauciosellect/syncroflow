import type { FastifyInstance } from 'fastify'
import { Webhook } from 'svix'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { createVirtualPhoneAccount, cancelVirtualPhoneAccount, getVirtualPhoneAccount, listAvailableAreaCodes } from './salvy.service'

const SALVY_WEBHOOK_SECRET = process.env.SALVY_WEBHOOK_SECRET!

export async function salvyRoutes(app: FastifyInstance) {
  app.get('/integrations/salvy/area-codes', { onRequest: [app.authenticate] }, async (_req, reply) => {
    const areaCodes = await listAvailableAreaCodes()
    return reply.send({ areaCodes })
  })

  // Cliente clica "contratar número" — provisiona na Salvy e cria Channel em status pending
  app.post('/integrations/salvy/virtual-numbers', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { areaCode } = z.object({ areaCode: z.number().int() }).parse(req.body)

    const account = await createVirtualPhoneAccount(areaCode, `SyncroFlow-${workspaceId}`)

    const channel = await prisma.channel.create({
      data: {
        workspaceId,
        type: 'WHATSAPP',
        name: account.phoneNumber,
        isActive: false, // só ativa depois da validação do SMS na Meta
        config: {
          provider: 'meta-cloud',
          salvyVirtualPhoneAccountId: account.id,
          salvyStatus: account.status,
          displayPhoneNumber: account.phoneNumber,
        },
      },
    })

    return reply.status(201).send({ channel, salvyAccount: account })
  })

  app.delete('/integrations/salvy/virtual-numbers/:channelId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { channelId } = z.object({ channelId: z.string() }).parse(req.params)

    const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })

    const config = channel.config as any
    const salvyId = config?.salvyVirtualPhoneAccountId
    if (!salvyId) return reply.status(400).send({ error: 'Canal não possui número virtual Salvy associado' })

    // status intermediário antes de confirmar cancelamento — evita inconsistência se a chamada falhar
    await prisma.channel.update({
      where: { id: channelId },
      data: { config: { ...config, salvyStatus: 'cancelamento_solicitado' } },
    })

    await cancelVirtualPhoneAccount(salvyId, 'company-canceled')

    const confirmed = await getVirtualPhoneAccount(salvyId)
    await prisma.channel.update({
      where: { id: channelId },
      data: {
        isActive: false,
        config: { ...config, salvyStatus: confirmed.status },
      },
    })

    return reply.send({ status: confirmed.status })
  })

  // Webhook da Salvy (assinado via Svix) — recebe sms.received com o código de verificação do WhatsApp
  app.post('/webhooks/salvy', { config: { rawBody: true } }, async (req, reply) => {
    const wh = new Webhook(SALVY_WEBHOOK_SECRET)
    let payload: any
    try {
      payload = wh.verify((req as any).rawBody, req.headers as Record<string, string>)
    } catch (err) {
      console.error('[SALVY-WEBHOOK] Falha na verificação de assinatura:', err)
      return reply.status(401).send({ error: 'Assinatura inválida' })
    }

    if (payload.type === 'sms.received') {
      const { virtualPhoneAccountId, message, detections } = payload.data
      const verificationCode = detections?.whatsapp?.verificationCode
      console.log(`[SALVY-WEBHOOK] SMS recebido para ${virtualPhoneAccountId}: "${message}"${verificationCode ? ` (código WhatsApp: ${verificationCode})` : ''}`)
      // Código fica disponível para o usuário consultar na tela de conexão do canal (polling via GET /integrations/salvy/virtual-numbers/:id/sms ou similar, a implementar no frontend)
    }

    return reply.status(200).send({ received: true })
  })
}

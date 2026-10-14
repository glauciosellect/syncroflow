import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getWorkspaceId } from '../../lib/workspace'
import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { getCall, saveCall, getCallingEligibility, provider } from './calls.service'

const sdpSchema = z.object({ sdp: z.string().min(10).max(20000) })

function metaError(err: any): string {
  return err?.response?.data?.error?.error_user_msg || err?.response?.data?.error?.message || err?.message || 'Erro na API da Meta'
}

export async function callsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // Ligação só pode ser operada por quem pertence ao workspace dono dela.
  async function loadCall(req: any, reply: any) {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const call = await getCall((req.params as any).callId)
    if (!call || call.workspaceId !== workspaceId) { reply.status(404).send({ error: 'Ligação não encontrada ou já encerrada' }); return null }
    return { call, userId: sub }
  }

  // Elegibilidade + estado de chamadas de cada número WhatsApp do workspace
  app.get('/calls/eligibility', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    return reply.send(await getCallingEligibility(await getWorkspaceId(sub, wid)))
  })

  // Interruptor: habilita/desabilita chamadas no número (API de configurações da Meta)
  app.put('/calls/settings', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const body = z.object({ channelId: z.string(), enabled: z.boolean() }).parse(req.body)
    const workspaceId = await getWorkspaceId(sub, wid)
    const channel = await prisma.channel.findFirst({ where: { id: body.channelId, workspaceId, type: 'WHATSAPP' } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })
    try {
      await provider.setCallingEnabled(channel.id, body.enabled)
    } catch (err: any) {
      return reply.status(400).send({ error: metaError(err) })
    }
    return reply.send({ ok: true, enabled: body.enabled })
  })

  // Oferta SDP da ligação (não vai pelo socket)
  app.get('/calls/:callId', async (req, reply) => {
    const r = await loadCall(req, reply); if (!r) return
    const { call } = r
    return reply.send({ callId: call.callId, state: call.state, contactName: call.contactName, phone: call.phone, conversationId: call.conversationId, sdp: call.sdp })
  })

  app.post('/calls/:callId/accept', async (req, reply) => {
    const r = await loadCall(req, reply); if (!r) return
    const { call, userId } = r
    if (call.state !== 'ringing') return reply.status(409).send({ error: 'Esta ligação já foi atendida por outra pessoa ou encerrou' })
    const { sdp } = sdpSchema.parse(req.body)
    try {
      // A Meta exige o mesmo SDP answer no pre_accept e no accept
      await provider.preAcceptCall(call.channelId, call.callId, sdp)
      await provider.acceptCall(call.channelId, call.callId, sdp)
    } catch (err: any) {
      return reply.status(400).send({ error: metaError(err) })
    }
    await saveCall({ ...call, state: 'accepted', acceptedById: userId })
    // Avisa os demais atendentes que alguém já pegou a ligação
    try { getIO().to(`ws:${call.workspaceId}`).emit('call:taken', { callId: call.callId, byUserId: userId }) } catch {}
    return reply.send({ ok: true })
  })

  app.post('/calls/:callId/reject', async (req, reply) => {
    const r = await loadCall(req, reply); if (!r) return
    const { call } = r
    if (call.state !== 'ringing') return reply.status(409).send({ error: 'Ligação não está mais tocando' })
    try { await provider.rejectCall(call.channelId, call.callId) } catch (err: any) { return reply.status(400).send({ error: metaError(err) }) }
    await saveCall({ ...call, state: 'rejected' })
    return reply.send({ ok: true })
  })

  app.post('/calls/:callId/terminate', async (req, reply) => {
    const r = await loadCall(req, reply); if (!r) return
    const { call } = r
    try { await provider.terminateCall(call.channelId, call.callId) } catch (err: any) { return reply.status(400).send({ error: metaError(err) }) }
    return reply.send({ ok: true })
  })
}

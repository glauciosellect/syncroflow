import type { FastifyInstance } from 'fastify'
import axios from 'axios'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { MetaCloudApiProvider } from '../channels/whatsapp/providers/meta-cloud.provider'

const META_APP_ID = process.env.META_APP_ID!
const META_APP_SECRET = process.env.META_APP_SECRET!

// Embedded Signup roda em popup (sem redirect_uri) — troca o code por token de longa duração
async function exchangeEmbeddedSignupCode(code: string): Promise<string> {
  const res = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
    params: {
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      code,
    },
  })
  return res.data.access_token
}

// Assina o app no WABA para receber mensagens via webhook (equivalente a setupMetaWebhook para páginas)
async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await axios.post(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {}, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return { ok: true }
  } catch (err: any) {
    const error = err?.response?.data?.error?.message || err?.message || 'Erro desconhecido'
    console.error('[META-WA-SIGNUP] Erro ao assinar app no WABA:', err?.response?.data || err?.message)
    return { ok: false, error }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Sem este passo o número fica com phoneNumberId criado no WABA mas nunca fica
// ativo de fato na rede do WhatsApp (não recebe/envia mensagem nenhuma,
// aparece para terceiros como "convidar via SMS"). O Embedded Signup completo
// (número escolhido dentro do fluxo Meta) dispara isso sozinho, mas números
// vindos de provedor externo (Salvy) ficam só com o SMS de verificação
// confirmado, sem o /register — por isso essa chamada precisa ser explícita.
//
// Tenta até 3 vezes com pequeno intervalo: logo após subscribeAppToWaba, a
// Meta às vezes ainda não propagou a assinatura do app no WABA internamente,
// e o /register falha por uma condição de corrida transitória — não por o
// número estar realmente inválido. Retry simples resolve a maioria desses
// casos sem exigir nenhuma ação manual.
async function registerPhoneNumber(
  phoneNumberId: string,
  accessToken: string
): Promise<{ ok: boolean; error?: string }> {
  let lastError = 'Erro desconhecido'
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await axios.post(`https://graph.facebook.com/v21.0/${phoneNumberId}/register`, {
        messaging_product: 'whatsapp',
        pin: '000000',
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      return { ok: true }
    } catch (err: any) {
      lastError = err?.response?.data?.error?.message || err?.message || 'Erro desconhecido'
      console.error(`[META-WA-SIGNUP] Tentativa ${attempt}/3 falhou ao registrar número:`, err?.response?.data || err?.message)
      if (attempt < 3) await sleep(1500)
    }
  }
  return { ok: false, error: lastError }
}

export async function metaWhatsAppSignupRoutes(app: FastifyInstance) {
  app.post('/channels/whatsapp-meta/signup', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)

    const { code, wabaId, phoneNumberId } = z.object({
      code: z.string().min(1),
      wabaId: z.string().optional(),
      phoneNumberId: z.string().optional(),
    }).parse(req.body)

    if (!wabaId || !phoneNumberId) {
      return reply.status(400).send({ error: 'wabaId/phoneNumberId não recebidos do Embedded Signup — tente reconectar' })
    }

    let accessToken: string
    try {
      accessToken = await exchangeEmbeddedSignupCode(code)
    } catch (err: any) {
      console.error('[META-WA-SIGNUP] Erro ao trocar code por token:', err?.response?.data || err?.message)
      return reply.status(400).send({ error: 'Não foi possível validar a conexão com a Meta' })
    }

    let displayPhoneNumber: string | undefined
    try {
      const phoneRes = await axios.get(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
        params: { access_token: accessToken, fields: 'display_phone_number,verified_name' },
      })
      displayPhoneNumber = phoneRes.data?.display_phone_number
    } catch (err: any) {
      console.error('[META-WA-SIGNUP] Erro ao buscar número:', err?.response?.data || err?.message)
    }

    const existing = await prisma.channel.findFirst({
      where: { workspaceId, type: 'WHATSAPP', config: { path: ['phoneNumberId'], equals: phoneNumberId } },
    })
    if (existing) return reply.send(existing)

    // Os dois passos abaixo são obrigatórios para o número ficar realmente
    // ativo na rede do WhatsApp — não apenas "existente" no WABA. Rodam ANTES
    // de criar o canal: se falharem definitivamente, a rota retorna erro real
    // ao invés de criar um canal "conectado" que na prática não funciona.
    const subscribeResult = await subscribeAppToWaba(wabaId, accessToken)
    const registerResult = await registerPhoneNumber(phoneNumberId, accessToken)

    if (!registerResult.ok) {
      return reply.status(502).send({
        error: `Não foi possível ativar o número na Meta: ${registerResult.error}. Tente novamente — se persistir, o número pode já estar registrado em outro WhatsApp Business ou app.`,
      })
    }

    const channel = await prisma.channel.create({
      data: {
        workspaceId,
        type: 'WHATSAPP',
        name: displayPhoneNumber || 'WhatsApp (Meta)',
        config: {
          provider: 'meta-cloud',
          phoneNumberId,
          wabaId,
          accessToken,
          displayPhoneNumber,
          registeredAt: new Date().toISOString(),
          subscribeWarning: subscribeResult.ok ? undefined : subscribeResult.error,
        },
      },
    })

    if (!subscribeResult.ok) {
      // O número está registrado (recebe/envia mensagem), mas o app pode não
      // receber os webhooks de mensagens recebidas até isso ser resolvido —
      // avisa no canal em vez de esconder atrás de um "conectado" genérico.
      console.error(`[META-WA-SIGNUP] Canal ${channel.id} criado e número registrado, mas assinatura do webhook falhou:`, subscribeResult.error)
    }

    const provider = new MetaCloudApiProvider()
    let statusFinal: string = 'desconhecido'
    try {
      statusFinal = await provider.getStatus(channel.id)
      if (statusFinal !== 'connected') console.error(`[META-WA-SIGNUP] Canal ${channel.id} criado mas status não é 'connected':`, statusFinal)
    } catch (err: any) {
      console.error('[META-WA-SIGNUP] Erro ao validar status do canal recém-criado:', err?.message)
    }

    return reply.status(201).send({
      ...channel,
      warning: !subscribeResult.ok
        ? 'Número ativado, mas pode haver atraso para começar a receber mensagens. Se não funcionar em alguns minutos, desconecte e tente novamente.'
        : undefined,
    })
  })
}

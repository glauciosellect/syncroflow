import { prisma } from '../../lib/prisma'
import { welcomeQueue } from '../../lib/queue'
import { redis } from '../../lib/redis'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'

const MESSAGES: Array<{ delayHours: number; text: (name: string) => string }> = [
  {
    delayHours: 0,
    text: (name) => `Olá, ${name}! 👋\n\nBem-vindo ao SyncroFlow! Seu trial de 14 dias começou agora.\n\nSou o assistente virtual do SyncroFlow e vou te acompanhar nessa jornada.\n\nSeu próximo passo: conectar seu WhatsApp Business ao painel.\n👉 app.syncroflow.io/canais\n\nQualquer dúvida, é só responder aqui. 😊`,
  },
  {
    delayHours: 24,
    text: (name) => `Oi, ${name}! Tudo certo com a configuração? 🚀\n\nVocê sabia que empresas que configuram o SyncroFlow no primeiro dia têm 3x mais chance de ativar o plano?\n\nSe ainda não conectou seu WhatsApp, posso te ajudar agora:\n👉 app.syncroflow.io/canais\n\nPrecisa de ajuda? Responda aqui ou acesse nosso suporte.`,
  },
  {
    delayHours: 72,
    text: (name) => `${name}, como está indo? 😊\n\nSeu trial tem mais 11 dias. Aqui estão 3 coisas que você pode fazer hoje:\n\n1️⃣ Criar seu primeiro fluxo de atendimento\n2️⃣ Testar o agente de IA respondendo perguntas\n3️⃣ Ver os relatórios de atendimento\n\nAcesse: app.syncroflow.io\n\nEstou aqui se precisar! 👇`,
  },
  {
    delayHours: 168,
    text: (name) => `${name}, você está na metade do seu trial! ⏰\n\nAté agora, como está sendo sua experiência?\n\na) 😍 Adorei, quero assinar\nb) 🤔 Ainda não configurei direito\nc) ❓ Tenho dúvidas\n\nResponde aqui com a letra e eu te ajudo no próximo passo!`,
  },
  {
    delayHours: 288,
    text: (name) => `${name}, seu trial termina em 2 dias! ⚠️\n\nPara não perder o atendimento automático dos seus clientes, garanta seu plano agora:\n\n💡 Plano Starter — a partir de R$60/mês\n👉 syncroflow.io/#planos\n\nTem alguma dúvida antes de assinar? Responde aqui!`,
  },
]

export async function scheduleWelcomeFlow(params: {
  userId: string
  workspaceId: string
  name: string
  phone: string
}) {
  const { userId, workspaceId, name, phone } = params

  const normalizedPhone = phone.replace(/\D/g, '')
  if (!normalizedPhone || normalizedPhone.length < 10) return

  const now = new Date()
  const records = MESSAGES.map((msg, index) => ({
    workspaceId,
    userId,
    phone: normalizedPhone,
    name,
    messageIndex: index,
    scheduledAt: new Date(now.getTime() + msg.delayHours * 60 * 60 * 1000),
    status: 'PENDING',
  }))

  await prisma.welcomeMessage.createMany({ data: records })

  // Mensagem 1 vai imediatamente; as demais via job agendado
  await welcomeQueue.add('send', { workspaceId, userId, phone: normalizedPhone, name, messageIndex: 0 }, {
    delay: 0,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  })

  for (let i = 1; i < MESSAGES.length; i++) {
    const delayMs = MESSAGES[i].delayHours * 60 * 60 * 1000
    await welcomeQueue.add('send', { workspaceId, userId, phone: normalizedPhone, name, messageIndex: i }, {
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    })
  }
}

export function getWelcomeMessageText(index: number, name: string): string {
  return MESSAGES[index]?.text(name) ?? ''
}

// Envia notificação direta ao dono do SyncroFlow quando novo usuário se cadastra.
// Usa o canal do workspace do dono + seta silence key para o Jarbas não responder.
export async function notifyOwnerNewUser(params: {
  name: string
  email: string
  phone?: string
  workspaceName?: string
  segment?: string
}) {
  const ownerPhone = process.env.OWNER_NOTIFY_PHONE
  const ownerChannelId = process.env.OWNER_NOTIFY_CHANNEL_ID
  if (!ownerPhone || !ownerChannelId) return

  const { name, email, phone, workspaceName, segment } = params

  const lines = [
    `🆕 *Novo cadastro no SyncroFlow!*`,
    ``,
    `👤 *Nome:* ${name}`,
    `📧 *Email:* ${email}`,
    phone ? `📱 *WhatsApp:* ${phone}` : `📱 *WhatsApp:* não informado`,
    workspaceName ? `🏢 *Empresa:* ${workspaceName}` : null,
    segment ? `🏷️ *Segmento:* ${segment}` : null,
    ``,
    `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  ].filter(l => l !== null).join('\n')

  try {
    // Seta silence por 5 min para o Jarbas não responder esta notificação
    const normalizedOwner = ownerPhone.replace(/\D/g, '')
    const silenceKey = `silence:${ownerChannelId}:${normalizedOwner}`
    await redis.set(silenceKey, '1', 'EX', 5 * 60)

    const provider = getWhatsAppProvider()
    await provider.sendText(ownerChannelId, normalizedOwner, lines)

    console.log(`[WELCOME] Notificação de novo usuário enviada para ${ownerPhone}`)
  } catch (err: any) {
    console.error('[WELCOME] Erro ao notificar dono:', err?.message)
  }
}

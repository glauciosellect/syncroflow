import { prisma } from '../../lib/prisma'
import { redis } from '../../lib/redis'
import { logger } from '../../lib/logger'
import { sendEmail } from '../../lib/mailer'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'

// Configuração de urgência guardada em Integration (platform 'urgencia'), campo metadata.
export interface UrgencyContact { name: string; phone: string }
export interface UrgencyConfig {
  enabled: boolean
  contacts: UrgencyContact[]
  emails: string[]
  templateName?: string // template aprovado na Meta (utility) usado quando a janela de 24h está fechada
  templateLanguage?: string
}

export const URGENCY_PLATFORM = 'urgencia'

// Rede de segurança por palavras-chave. A lista é propositalmente ampla: um falso alarme
// custa uma olhada de um humano, uma urgência ignorada pode custar muito mais.
const URGENCY_PATTERNS: RegExp[] = [
  /\b(vou|ia|quero|vai)\s+(me\s+)?(matar|suicidar)\b|\bsuic[ií]dio\b|\bacabar\s+com\s+(a\s+)?minha\s+vida\b/i,
  /\b(estou|to|tô|fui|vou\s+ser|serei|sendo)\s+(preso|presa|detido|detida|algemado|algemada)\b|\bmandado\s+de\s+pris[ãa]o\b|\bflagrante\b|\bdelegacia\b/i,
  /\b(atirei|esfaqueei|matei|assassinei|baleei|bati\s+em)\b|\bfui\s+(baleado|baleada|esfaqueado|esfaqueada|assaltado|assaltada|sequestrado|sequestrada)\b/i,
  /\b(estou|to|tô|esta|está)\s+(apanhando|sendo\s+(agredid[oa]|ameaçad[oa]|espancad[oa]|perseguid[oa]))\b|\bviol[eê]ncia\s+dom[eé]stica\b|\bmeu\s+(marido|namorado|companheiro|ex)\s+(vai\s+me\s+(matar|bater)|me\s+(bate|agrediu|ameaça|ameaçou|espancou))\b|\bme\s+(agrediu|espancou|ameaçou\s+de\s+morte)\b/i,
  /\b(socorro|me\s+ajud[ae]\s+por\s+favor)\b.{0,40}\b(agora|urgente|rápido|rapido)\b|\bemerg[eê]ncia\b|\bperigo\s+de\s+vida\b|\bestou\s+em\s+perigo\b/i,
  /\b(infarto|avc|overdose|desmaiou|desmaiei|n[ãa]o\s+est[aá]\s+respirando|sangrando\s+muito|acidente\s+grave|internad[oa]\s+(na\s+)?uti)\b/i,
  /\b(vão|vao|v[aã]o)\s+(me\s+)?(prender|matar)\b|\bamea[cç]a\s+de\s+morte\b|\bsequestr(o|aram|ado|ada)\b/i,
]

export function detectUrgency(text: string): boolean {
  const t = (text || '').trim()
  if (t.length < 4) return false
  return URGENCY_PATTERNS.some((re) => re.test(t))
}

export async function getUrgencyConfig(workspaceId: string): Promise<UrgencyConfig> {
  const row = await prisma.integration.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: URGENCY_PLATFORM } },
  })
  const m = (row?.metadata as any) || {}
  return {
    enabled: row ? row.status === 'active' && m.enabled !== false : false,
    contacts: Array.isArray(m.contacts) ? m.contacts.filter((c: any) => c?.phone) : [],
    emails: Array.isArray(m.emails) ? m.emails.filter(Boolean) : [],
    templateName: m.templateName || undefined,
    templateLanguage: m.templateLanguage || 'pt_BR',
  }
}

export async function saveUrgencyConfig(workspaceId: string, cfg: UrgencyConfig) {
  const metadata = {
    enabled: cfg.enabled,
    contacts: cfg.contacts,
    emails: cfg.emails,
    templateName: cfg.templateName || null,
    templateLanguage: cfg.templateLanguage || 'pt_BR',
  } as any
  return prisma.integration.upsert({
    where: { workspaceId_platform: { workspaceId, platform: URGENCY_PLATFORM } },
    create: { workspaceId, platform: URGENCY_PLATFORM, status: 'active', metadata },
    update: { status: 'active', metadata },
  })
}

function onlyDigits(s: string) {
  return (s || '').replace(/\D/g, '')
}

export interface UrgencyAlertResult {
  alerted: boolean // pelo menos um humano foi avisado de fato (WhatsApp ou e-mail)
  channelsOk: string[]
}

/**
 * Dispara o alerta para os contatos de urgência. Nunca lança.
 * `alerted` só é true quando ao menos um envio realmente saiu — o agente só pode dizer
 * ao cliente que "avisou a equipe" nesse caso.
 */
export async function sendUrgencyAlert(opts: {
  workspaceId: string
  conversationId: string
  whatsappChannelId?: string
  clientName: string
  clientPhone?: string
  lastMessage: string
}): Promise<UrgencyAlertResult> {
  const { workspaceId, conversationId, whatsappChannelId, clientName, clientPhone, lastMessage } = opts
  const result: UrgencyAlertResult = { alerted: false, channelsOk: [] }

  try {
    const cfg = await getUrgencyConfig(workspaceId)
    if (!cfg.enabled || (cfg.contacts.length === 0 && cfg.emails.length === 0)) return result

    const baseUrl = process.env.WEB_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.syncroflow.io'
    const link = `${baseUrl}/chat?conversation=${conversationId}`
    const resumo = lastMessage.length > 280 ? lastMessage.slice(0, 277) + '...' : lastMessage
    const body =
      `🚨 URGÊNCIA — ${clientName}${clientPhone ? ` (${clientPhone})` : ''}\n\n` +
      `"${resumo}"\n\n` +
      `A IA pausou o atendimento. Abra a conversa e clique em "Assumir":\n${link}`

    // Canal WhatsApp de onde o alerta sai
    let channelId = whatsappChannelId
    if (!channelId) {
      const ch = await prisma.channel.findFirst({ where: { workspaceId, type: 'WHATSAPP' as any, isActive: true } })
      channelId = ch?.id
    }

    if (channelId) {
      const provider = getWhatsAppProvider()
      for (const c of cfg.contacts) {
        const to = onlyDigits(c.phone)
        if (!to) continue
        let sent = false
        try {
          await provider.sendText(channelId, to, body)
          sent = true
        } catch (err: any) {
          logger.warn('Urgency alert: texto livre falhou, tentando template', { to, err: err?.message })
        }
        if (!sent && cfg.templateName && provider.sendTemplate) {
          try {
            await provider.sendTemplate(channelId, to, cfg.templateName, cfg.templateLanguage || 'pt_BR', [
              clientName,
              clientPhone || '-',
              resumo.replace(/\s+/g, ' '),
            ])
            sent = true
          } catch (err: any) {
            logger.error('Urgency alert: template falhou', { to, err: err?.message })
          }
        }
        if (sent) result.channelsOk.push(`whatsapp:${to}`)
      }
    }

    for (const email of cfg.emails) {
      try {
        await sendEmail(
          email,
          `🚨 Urgência no atendimento: ${clientName}`,
          `<h2>🚨 Urgência detectada</h2><p><strong>${clientName}</strong>${clientPhone ? ` (${clientPhone})` : ''}</p><blockquote>${resumo}</blockquote><p><a href="${link}">Abrir conversa e assumir</a></p>`
        )
        result.channelsOk.push(`email:${email}`)
      } catch (err: any) {
        logger.error('Urgency alert: e-mail falhou', { email, err: err?.message })
      }
    }

    result.alerted = result.channelsOk.length > 0
  } catch (err: any) {
    logger.error('Urgency alert: erro inesperado', { err: err?.message })
  }
  return result
}

// Evita disparar o mesmo alerta em rajada para a mesma conversa (reenvia após o intervalo).
export async function shouldSendUrgencyAlert(conversationId: string, windowSeconds = 600): Promise<boolean> {
  try {
    const ok = await redis.set(`urgency:alert:${conversationId}`, '1', 'EX', windowSeconds, 'NX')
    return ok === 'OK'
  } catch {
    return true
  }
}

const SAFETY_LINE =
  'Se você ou alguém estiver em risco imediato, ligue agora: 190 (Polícia), 192 (SAMU) ou 180 (violência contra a mulher).'

export function buildUrgencyReply(alerted: boolean): string {
  if (alerted) {
    return `Entendi, isso é urgente. Já avisei agora a pessoa responsável, que vai falar com você o mais rápido possível. Fique com o celular por perto. 🙏\n\n${SAFETY_LINE}`
  }
  return `Entendi que é uma situação urgente e deixei esta conversa marcada como prioridade para a equipe.\n\n${SAFETY_LINE}`
}

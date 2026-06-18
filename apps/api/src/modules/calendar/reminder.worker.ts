import { createWorker } from '../../lib/queue'
import { prisma } from '../../lib/prisma'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'

const TZ = 'America/Sao_Paulo'

// Cota mensal de mensagens ativas (lembretes) por plano — independe dos créditos de IA
export const ACTIVE_MSG_LIMITS: Record<string, number> = {
  TRIAL: 20,
  STARTER: 200,
  PRO: 500,
  BUSINESS: 1500,
  ENTERPRISE: 5000,
}

export function startReminderWorker() {
  return createWorker<{ appointmentId: string }>(
    'reminders',
    async (job) => {
      const appt = await prisma.appointment.findUnique({
        where: { id: job.data.appointmentId },
        include: { contact: true, workspace: true },
      })
      // Consulta cancelada (registro removido) ou lembrete já enviado — nada a fazer
      if (!appt || appt.reminderSentAt) return
      if (!appt.contact.phone) return

      const limit = (ACTIVE_MSG_LIMITS[appt.workspace.plan] ?? 0) + appt.workspace.activeMsgsExtra
      if (appt.workspace.activeMsgsUsed >= limit) {
        console.log(`[REMINDER] Cota de mensagens ativas esgotada para workspace ${appt.workspaceId} — lembrete não enviado (atendimento normal não é afetado)`)
        return
      }

      const horarioFormatado = appt.startAt.toLocaleString('pt-BR', {
        timeZone: TZ,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })

      const provider = getWhatsAppProvider()
      await provider.sendText(appt.channelId, appt.contact.phone, `Lembrete: você tem "${appt.summary}" agendado para ${horarioFormatado}.`)

      await prisma.workspace.update({
        where: { id: appt.workspaceId },
        data: { activeMsgsUsed: { increment: 1 } },
      })
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      })

      console.log(`[REMINDER] Lembrete enviado para ${appt.contact.phone} (appointment ${appt.id})`)
    },
    5,
  )
}

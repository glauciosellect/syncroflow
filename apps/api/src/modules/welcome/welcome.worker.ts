import { createWorker } from '../../lib/queue'
import { prisma } from '../../lib/prisma'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'
import { getWelcomeMessageText } from './welcome.service'

export function startWelcomeWorker() {
  return createWorker<{
    workspaceId: string
    userId: string
    phone: string
    name: string
    messageIndex: number
  }>(
    'welcome',
    async (job) => {
      const { workspaceId, phone, name, messageIndex } = job.data

      // Encontra um canal WhatsApp ativo do workspace
      const channel = await prisma.channel.findFirst({
        where: { workspaceId, type: 'WHATSAPP', isActive: true },
      })

      if (!channel) {
        console.log(`[WELCOME] Nenhum canal WhatsApp ativo para workspace ${workspaceId} — pulando msg ${messageIndex}`)
        await prisma.welcomeMessage.updateMany({
          where: { workspaceId, phone, messageIndex, status: 'PENDING' },
          data: { status: 'SKIPPED' },
        })
        return
      }

      const text = getWelcomeMessageText(messageIndex, name)
      if (!text) return

      try {
        const provider = getWhatsAppProvider()
        await provider.sendText(channel.id, phone, text)

        await prisma.welcomeMessage.updateMany({
          where: { workspaceId, phone, messageIndex, status: 'PENDING' },
          data: { status: 'SENT', sentAt: new Date() },
        })

        console.log(`[WELCOME] Mensagem ${messageIndex + 1} enviada para ${phone} (workspace ${workspaceId})`)
      } catch (err: any) {
        console.error(`[WELCOME] Erro ao enviar msg ${messageIndex} para ${phone}:`, err?.message)
        throw err
      }
    },
    3
  )
}

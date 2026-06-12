import axios from 'axios'
import type { WhatsAppProvider, WhatsAppMessage } from '../provider.interface'
import { prisma } from '../../../../lib/prisma'

export class UazApiProvider implements WhatsAppProvider {
  private baseUrl = process.env.UAZAPI_URL!
  private adminToken = process.env.UAZAPI_TOKEN!

  // Headers para admin (criar/listar instâncias)
  private adminHeaders() {
    return { 'token': this.adminToken, 'Content-Type': 'application/json' }
  }

  // Headers para uma instância específica
  private instanceHeaders(instanceToken: string) {
    return { 'token': instanceToken, 'Content-Type': 'application/json' }
  }

  // Busca o token da instância a partir do channelId
  private async getInstanceConfig(channelId: string): Promise<{ instanceId: string; instanceToken: string }> {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } })
    const config = channel?.config as any
    const instanceId = config?.instanceId
    const instanceToken = config?.instanceToken || this.adminToken
    if (!instanceId) throw new Error(`Canal ${channelId} sem instanceId configurado`)
    return { instanceId, instanceToken }
  }

  // Cria instância na UazAPI e salva instanceId + instanceToken no canal
  async createInstance(channelId: string) {
    const instanceId = `sf_${channelId.slice(-12)}`
    const webhookUrl = `${process.env.API_URL}/webhooks/whatsapp/${channelId}`

    try {
      // Cria a instância na UazAPI
      const res = await axios.post(`${this.baseUrl}/instance/create`, {
        name: instanceId,
        webhook: webhookUrl,
        webhookEvents: { onMessage: true },
      }, { headers: this.adminHeaders() })

      const instanceToken = res.data?.token || res.data?.instance?.token || this.adminToken

      // Salva instanceId e instanceToken no config do canal
      await prisma.channel.update({
        where: { id: channelId },
        data: { config: { provider: 'uazapi', instanceId, instanceToken, webhookUrl } },
      })
    } catch (err: any) {
      console.error('[UAZAPI] Erro ao criar instância:', err?.response?.data || err?.message)
      // Fallback: salva só o instanceId sem token próprio
      await prisma.channel.update({
        where: { id: channelId },
        data: { config: { provider: 'uazapi', instanceId, instanceToken: this.adminToken, webhookUrl } },
      })
    }
  }

  async getQRCode(channelId: string): Promise<string> {
    try {
      const { instanceId, instanceToken } = await this.getInstanceConfig(channelId)
      const res = await axios.get(`${this.baseUrl}/instance/qrcode`, {
        headers: this.instanceHeaders(instanceToken),
        params: { name: instanceId },
      })
      return res.data?.qrcode || res.data?.instance?.qrcode || ''
    } catch {
      return ''
    }
  }

  async getStatus(channelId: string): Promise<'connected' | 'disconnected' | 'qr_required'> {
    try {
      const { instanceId, instanceToken } = await this.getInstanceConfig(channelId)
      const res = await axios.get(`${this.baseUrl}/instance/status`, {
        headers: this.instanceHeaders(instanceToken),
        params: { name: instanceId },
      })
      const connected = res.data?.status?.connected ?? res.data?.connected
      const qrcode = res.data?.instance?.qrcode ?? res.data?.qrcode
      if (connected === true) return 'connected'
      if (qrcode) return 'qr_required'
      return 'disconnected'
    } catch {
      return 'disconnected'
    }
  }

  async sendText(channelId: string, to: string, text: string) {
    const { instanceToken } = await this.getInstanceConfig(channelId)
    await axios.post(`${this.baseUrl}/send/text`, {
      number: to,
      text,
    }, { headers: this.instanceHeaders(instanceToken) })
  }

  async sendMedia(channelId: string, to: string, mediaUrl: string, caption?: string) {
    const { instanceToken } = await this.getInstanceConfig(channelId)
    await axios.post(`${this.baseUrl}/send/media`, {
      number: to,
      type: 'image',
      file: mediaUrl,
      text: caption || '',
    }, { headers: this.instanceHeaders(instanceToken) })
  }

  async sendAudio(channelId: string, to: string, audioUrl: string) {
    const { instanceToken } = await this.getInstanceConfig(channelId)
    await axios.post(`${this.baseUrl}/send/media`, {
      number: to,
      type: 'ptt',
      file: audioUrl,
    }, { headers: this.instanceHeaders(instanceToken) })
  }

  async sendAudioBase64(channelId: string, to: string, audioBase64: string) {
    const { instanceToken } = await this.getInstanceConfig(channelId)
    try {
      const res = await axios.post(`${this.baseUrl}/send/media`, {
        number: to,
        type: 'ptt',
        file: `data:audio/mp3;base64,${audioBase64}`,
      }, { headers: this.instanceHeaders(instanceToken) })
      console.log('[UAZAPI] sendAudioBase64 OK:', res.status, JSON.stringify(res.data)?.slice(0, 200))
    } catch (err: any) {
      console.error('[UAZAPI] sendAudioBase64 ERRO:', err?.response?.status, JSON.stringify(err?.response?.data)?.slice(0, 300))
      throw err
    }
  }

  async downloadMedia(messageId: string): Promise<{ fileURL?: string; transcription?: string; mimetype?: string }> {
    try {
      console.log('[UAZAPI] downloadMedia messageId:', messageId)
      const res = await axios.post(`${this.baseUrl}/message/download`, {
        id: messageId,
        return_link: true,
        generate_mp3: true,
        transcribe: true,
        openai_apikey: process.env.OPENAI_API_KEY,
      }, { headers: this.adminHeaders(), timeout: 30000 })
      console.log('[UAZAPI] downloadMedia resposta:', JSON.stringify(res.data)?.slice(0, 300))
      return res.data || {}
    } catch (err: any) {
      console.error('[UAZAPI] downloadMedia ERRO:', err?.response?.status, JSON.stringify(err?.response?.data)?.slice(0, 300), err?.message)
      return {}
    }
  }

  parseWebhook(payload: any): WhatsAppMessage | null {
    if (!payload) return null

    const msg = payload.message
    if (!msg) return null

    if (msg.fromMe === true) return null
    if (msg.isGroup === true) return null

    const chatid = msg.chatid || msg.sender_pn || ''
    const phone = chatid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    if (!phone) return null

    const text = typeof msg.text === 'string' && msg.text ? msg.text : undefined

    const contentObj = typeof msg.content === 'object' && msg.content !== null ? msg.content : null
    const mimetype: string = msg.mimetype || msg.Mimetype || contentObj?.mimetype || ''
    const messageId: string = msg.messageid || msg.id || ''

    let mediaType: WhatsAppMessage['mediaType'] | undefined

    const isAudio = mimetype.startsWith('audio') || msg.type === 'ptt' || msg.type === 'audio' || msg.PTT === true || contentObj?.PTT === true
    const isImage = mimetype.startsWith('image') || msg.type === 'image'
    const isVideo = mimetype.startsWith('video') || msg.type === 'video'
    const isDoc = mimetype.includes('pdf') || mimetype.includes('word') || mimetype.includes('document') || msg.type === 'document'

    if (isAudio) mediaType = 'audio'
    else if (isImage) mediaType = 'image'
    else if (isVideo) mediaType = 'video'
    else if (isDoc) mediaType = 'document'

    if (!text && !mediaType) return null

    return {
      from: phone,
      name: msg.senderName || payload.chat?.name || 'Desconhecido',
      text,
      mediaUrl: mediaType ? `uazapi:${messageId}` : undefined,
      mediaType,
      messageId,
      timestamp: msg.messageTimestamp
        ? Math.floor(msg.messageTimestamp / 1000)
        : Math.floor(Date.now() / 1000),
    }
  }

  async deleteInstance(channelId: string) {
    try {
      const { instanceId, instanceToken } = await this.getInstanceConfig(channelId)
      await axios.delete(`${this.baseUrl}/instance/delete`, {
        headers: this.instanceHeaders(instanceToken),
        data: { name: instanceId },
      })
    } catch {}
  }
}

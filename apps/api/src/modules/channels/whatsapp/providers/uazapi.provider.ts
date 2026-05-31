import axios from 'axios'
import type { WhatsAppProvider, WhatsAppMessage } from '../provider.interface'

export class UazApiProvider implements WhatsAppProvider {
  private baseUrl = process.env.UAZAPI_URL!
  private token = process.env.UAZAPI_TOKEN!

  private headers() {
    return { 'token': this.token, 'Content-Type': 'application/json' }
  }

  async createInstance(channelId: string) {
    // UazAPI: instância já existe, só configura o webhook
    await axios.post(`${this.baseUrl}/webhook/set`, {
      url: `${process.env.API_URL}/webhooks/whatsapp/${channelId}`,
      events: { onMessage: true },
    }, { headers: this.headers() })
  }

  async getQRCode(channelId: string): Promise<string> {
    const res = await axios.get(`${this.baseUrl}/instance/status`, {
      headers: this.headers(),
    })
    return res.data.instance?.qrcode || ''
  }

  async getStatus(channelId: string): Promise<'connected' | 'disconnected' | 'qr_required'> {
    const res = await axios.get(`${this.baseUrl}/instance/status`, {
      headers: this.headers(),
    })
    const connected = res.data?.status?.connected
    const qrcode = res.data?.instance?.qrcode
    if (connected === true) return 'connected'
    if (qrcode) return 'qr_required'
    return 'disconnected'
  }

  async sendText(channelId: string, to: string, text: string) {
    await axios.post(`${this.baseUrl}/send/text`, {
      number: to,
      text,
    }, { headers: this.headers() })
  }

  async sendMedia(channelId: string, to: string, mediaUrl: string, caption?: string) {
    await axios.post(`${this.baseUrl}/message/sendMedia`, {
      phone: to,
      mediaUrl,
      caption: caption || '',
      mediaType: 'image',
    }, { headers: this.headers() })
  }

  async sendAudio(channelId: string, to: string, audioUrl: string) {
    await axios.post(`${this.baseUrl}/message/sendAudio`, {
      phone: to,
      audioUrl,
    }, { headers: this.headers() })
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

    // Texto: pode ser string direta ou estar em msg.text
    const text = typeof msg.text === 'string' ? msg.text :
                 typeof msg.content === 'string' ? msg.content : undefined

    // Mídia: UAZAPI envia content como objeto { URL, mimetype, ... }
    const contentObj = typeof msg.content === 'object' && msg.content !== null ? msg.content : null
    const mimetype: string = msg.mimetype || msg.Mimetype || contentObj?.mimetype || ''
    const rawUrl: string = msg.mediaUrl || msg.fileUrl || msg.url || contentObj?.URL || contentObj?.url || ''

    // Detectar mídia
    let mediaUrl: string | undefined
    let mediaType: WhatsAppMessage['mediaType'] | undefined

    if (rawUrl) {
      if (mimetype.startsWith('audio') || msg.type === 'ptt' || msg.type === 'audio' || msg.PTT === true) {
        mediaUrl = rawUrl
        mediaType = 'audio'
      } else if (mimetype.startsWith('image') || msg.type === 'image') {
        mediaUrl = rawUrl
        mediaType = 'image'
      } else if (mimetype.startsWith('video') || msg.type === 'video') {
        mediaUrl = rawUrl
        mediaType = 'video'
      } else if (
        mimetype.includes('pdf') || mimetype.includes('word') || mimetype.includes('document') ||
        mimetype.includes('spreadsheet') || mimetype.includes('presentation') ||
        mimetype.includes('text/plain') || msg.type === 'document'
      ) {
        mediaUrl = rawUrl
        mediaType = 'document'
      }
    }

    // Ignorar se não tem texto nem mídia reconhecida
    if (!text && !mediaUrl) return null

    return {
      from: phone,
      name: msg.senderName || payload.chat?.name || 'Desconhecido',
      text,
      mediaUrl,
      mediaType,
      messageId: msg.messageid || msg.id || '',
      timestamp: msg.messageTimestamp
        ? Math.floor(msg.messageTimestamp / 1000)
        : Math.floor(Date.now() / 1000),
    }
  }

  async deleteInstance(channelId: string) {
    // Remove webhook ao desconectar
    try {
      await axios.post(`${this.baseUrl}/webhook/set`, {
        url: '',
        events: {},
      }, { headers: this.headers() })
    } catch {}
  }
}

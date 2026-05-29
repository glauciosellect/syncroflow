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
    const res = await axios.get(`${this.baseUrl}/instance/qrcode`, {
      headers: this.headers(),
    })
    return res.data.qrcode || res.data.base64 || ''
  }

  async getStatus(channelId: string): Promise<'connected' | 'disconnected' | 'qr_required'> {
    const res = await axios.get(`${this.baseUrl}/instance/info`, {
      headers: this.headers(),
    })
    const status = res.data?.status || res.data?.instance?.status
    if (status === 'connected' || status === 'open') return 'connected'
    if (status === 'qr') return 'qr_required'
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

    // Formato UazAPI: { EventType, message, chat, owner }
    const msg = payload.message
    if (!msg) return null

    // Ignorar mensagens enviadas pelo próprio número
    if (msg.fromMe === true) return null

    // Ignorar grupos
    if (msg.isGroup === true) return null

    // Ignorar se não tiver texto
    const text = msg.text || msg.content
    if (!text || typeof text !== 'string') return null

    // Telefone do remetente — usa chatid (número da conversa) sem sufixo
    const chatid = msg.chatid || msg.sender_pn || ''
    const phone = chatid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    if (!phone) return null

    return {
      from: phone,
      name: msg.senderName || payload.chat?.name || 'Desconhecido',
      text,
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

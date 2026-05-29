import axios from 'axios'
import type { WhatsAppProvider, WhatsAppMessage } from '../provider.interface'

export class EvolutionApiProvider implements WhatsAppProvider {
  private baseUrl = process.env.EVOLUTION_API_URL!
  private apiKey = process.env.EVOLUTION_API_KEY!

  async createInstance(channelId: string) {
    await axios.post(`${this.baseUrl}/instance/create`, {
      instanceName: channelId,
      token: this.apiKey,
      webhook: `${process.env.API_URL}/webhooks/whatsapp/${channelId}`,
      webhookByEvents: true,
      events: ['MESSAGES_UPSERT'],
    }, { headers: { apikey: this.apiKey } })
  }

  async getQRCode(channelId: string): Promise<string> {
    const res = await axios.get(`${this.baseUrl}/instance/connect/${channelId}`, {
      headers: { apikey: this.apiKey },
    })
    return res.data.qrcode?.base64 || res.data.base64
  }

  async getStatus(channelId: string): Promise<'connected' | 'disconnected' | 'qr_required'> {
    const res = await axios.get(`${this.baseUrl}/instance/connectionState/${channelId}`, {
      headers: { apikey: this.apiKey },
    })
    const state = res.data.instance?.state
    if (state === 'open') return 'connected'
    if (state === 'qr') return 'qr_required'
    return 'disconnected'
  }

  async sendText(channelId: string, to: string, text: string) {
    await axios.post(`${this.baseUrl}/message/sendText/${channelId}`, { number: to, text }, {
      headers: { apikey: this.apiKey },
    })
  }

  async sendMedia(channelId: string, to: string, mediaUrl: string, caption?: string) {
    await axios.post(`${this.baseUrl}/message/sendMedia/${channelId}`, {
      number: to, mediatype: 'image', media: mediaUrl, caption,
    }, { headers: { apikey: this.apiKey } })
  }

  async sendAudio(channelId: string, to: string, audioUrl: string) {
    await axios.post(`${this.baseUrl}/message/sendWhatsAppAudio/${channelId}`, {
      number: to, audio: audioUrl,
    }, { headers: { apikey: this.apiKey } })
  }

  parseWebhook(payload: any): WhatsAppMessage | null {
    if (payload.event !== 'messages.upsert') return null
    if (payload.data?.key?.fromMe) return null
    return {
      from: payload.data.key.remoteJid.replace('@s.whatsapp.net', ''),
      name: payload.data.pushName || 'Desconhecido',
      text: payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text,
      messageId: payload.data.key.id,
      timestamp: payload.data.messageTimestamp,
    }
  }

  async deleteInstance(channelId: string) {
    await axios.delete(`${this.baseUrl}/instance/delete/${channelId}`, {
      headers: { apikey: this.apiKey },
    })
  }
}

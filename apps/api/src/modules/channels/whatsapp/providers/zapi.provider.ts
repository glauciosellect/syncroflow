import axios from 'axios'
import type { WhatsAppProvider, WhatsAppMessage } from '../provider.interface'

export class ZApiProvider implements WhatsAppProvider {
  private baseUrl = process.env.ZAPI_BASE_URL!
  private clientToken = process.env.ZAPI_CLIENT_TOKEN!

  private instanceUrl(channelId: string) {
    const [instanceId, instanceToken] = channelId.split(':')
    return {
      url: `${this.baseUrl}/instances/${instanceId}/token/${instanceToken}`,
      instanceToken,
    }
  }

  async createInstance(channelId: string) {
    const { url } = this.instanceUrl(channelId)
    await axios.put(`${url}/update-webhook-received`, {
      webhookReceivedDelivery: false,
      value: `${process.env.API_URL}/webhooks/whatsapp/${channelId}`,
    }, { headers: { 'Client-Token': this.clientToken } })
  }

  async getQRCode(channelId: string): Promise<string> {
    const { url } = this.instanceUrl(channelId)
    const res = await axios.get(`${url}/qr-code/image`, {
      headers: { 'Client-Token': this.clientToken },
    })
    return res.data.value
  }

  async getStatus(channelId: string): Promise<'connected' | 'disconnected' | 'qr_required'> {
    const { url } = this.instanceUrl(channelId)
    const res = await axios.get(`${url}/status`, {
      headers: { 'Client-Token': this.clientToken },
    })
    if (res.data.connected) return 'connected'
    if (res.data.smartphoneConnected) return 'qr_required'
    return 'disconnected'
  }

  async sendText(channelId: string, to: string, text: string) {
    const { url } = this.instanceUrl(channelId)
    await axios.post(`${url}/send-text`, { phone: to, message: text }, {
      headers: { 'Client-Token': this.clientToken },
    })
  }

  async sendMedia(channelId: string, to: string, mediaUrl: string, caption?: string) {
    const { url } = this.instanceUrl(channelId)
    await axios.post(`${url}/send-image`, { phone: to, image: mediaUrl, caption }, {
      headers: { 'Client-Token': this.clientToken },
    })
  }

  async sendAudio(channelId: string, to: string, audioUrl: string) {
    const { url } = this.instanceUrl(channelId)
    await axios.post(`${url}/send-audio`, { phone: to, audio: audioUrl }, {
      headers: { 'Client-Token': this.clientToken },
    })
  }

  parseWebhook(payload: any): WhatsAppMessage | null {
    if (!payload.phone || payload.fromMe) return null
    return {
      from: payload.phone,
      name: payload.senderName || 'Desconhecido',
      text: payload.text?.message,
      mediaUrl: payload.image?.imageUrl || payload.audio?.audioUrl || payload.document?.documentUrl,
      mediaType: payload.type?.toLowerCase(),
      messageId: payload.messageId,
      timestamp: Math.floor(new Date(payload.momment).getTime() / 1000),
    }
  }

  async deleteInstance(channelId: string) {
    const { url } = this.instanceUrl(channelId)
    await axios.put(`${url}/update-webhook-received`, { value: '' }, {
      headers: { 'Client-Token': this.clientToken },
    })
  }
}

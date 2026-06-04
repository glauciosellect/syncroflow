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
    await axios.post(`${this.baseUrl}/send/media`, {
      number: to,
      type: 'image',
      file: mediaUrl,
      text: caption || '',
    }, { headers: this.headers() })
  }

  async sendAudio(channelId: string, to: string, audioUrl: string) {
    await axios.post(`${this.baseUrl}/send/media`, {
      number: to,
      type: 'ptt',
      file: audioUrl,
    }, { headers: this.headers() })
  }

  async sendAudioBase64(channelId: string, to: string, audioBase64: string) {
    try {
      const res = await axios.post(`${this.baseUrl}/send/media`, {
        number: to,
        type: 'ptt',
        file: `data:audio/mp3;base64,${audioBase64}`,
      }, { headers: this.headers() })
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
      }, { headers: this.headers(), timeout: 30000 })
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

    // Detectar mídia pelo tipo ou mimetype
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

    // Ignorar se não tem texto nem mídia reconhecida
    if (!text && !mediaType) return null

    return {
      from: phone,
      name: msg.senderName || payload.chat?.name || 'Desconhecido',
      text,
      mediaUrl: mediaType ? `uazapi:${messageId}` : undefined, // marcador para baixar depois
      mediaType,
      messageId,
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

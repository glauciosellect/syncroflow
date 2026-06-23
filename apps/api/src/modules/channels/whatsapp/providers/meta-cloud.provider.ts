import axios from 'axios'
import type { WhatsAppProvider, WhatsAppMessage } from '../provider.interface'
import { prisma } from '../../../../lib/prisma'

const API_VERSION = process.env.META_WHATSAPP_API_VERSION || 'v21.0'
const GRAPH_URL = `https://graph.facebook.com/${API_VERSION}`

// A Meta recebe e entrega números BR sem o 9º dígito (ex: 553288290229), mas
// exige o número completo com 9º dígito para ENVIAR (ex: 5532988290229).
// Aplicada tanto no envio (sendText/sendMedia/...) quanto no recebimento
// (parseWebhook), para o "from" já chegar normalizado e Contact.externalId
// nunca duplicar o mesmo cliente com/sem o 9º dígito.
export function normalizeBrazilianNumber(to: string): string {
  const digits = to.replace(/\D/g, '')
  // 55 + DDD (2) + número sem 9º dígito (8) = 12 dígitos
  if (digits.length === 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4)
    const rest = digits.slice(4)
    if (rest.length === 8 && !rest.startsWith('9')) {
      return `55${ddd}9${rest}`
    }
  }
  return digits
}

// Detecta o tipo de mídia pela extensão da URL — a Meta Cloud API exige o
// campo correto (image/video/document) no payload, não aceita um tipo
// genérico para qualquer arquivo.
function detectMediaType(url: string): 'image' | 'video' | 'document' {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image'
  if (['mp4', '3gp', 'mov'].includes(ext)) return 'video'
  return 'document'
}

interface MetaCloudConfig {
  provider: 'meta-cloud'
  phoneNumberId: string
  wabaId?: string
  accessToken: string
  displayPhoneNumber?: string
}

export class MetaCloudApiProvider implements WhatsAppProvider {
  private async getConfig(channelId: string): Promise<MetaCloudConfig> {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } })
    const config = channel?.config as any
    if (!config?.phoneNumberId || !config?.accessToken) {
      throw new Error(`Canal ${channelId} sem phoneNumberId/accessToken configurados (conectar via Embedded Signup)`)
    }
    return config
  }

  // Embedded Signup (fase futura) é quem popula phoneNumberId/accessToken em channel.config.
  // Aqui apenas validamos que a configuração já existe.
  async createInstance(channelId: string) {
    await this.getConfig(channelId)
  }

  async deleteInstance(_channelId: string) {
    // Cloud API não tem instância para apagar — token é revogado pelo cliente no painel Meta.
  }

  // Cloud API não usa QR Code — conexão é via Embedded Signup (OAuth popup).
  async getQRCode(_channelId: string): Promise<string> {
    return ''
  }

  async getStatus(channelId: string): Promise<'connected' | 'disconnected' | 'qr_required'> {
    try {
      const { phoneNumberId, accessToken } = await this.getConfig(channelId)
      const res = await axios.get(`${GRAPH_URL}/${phoneNumberId}`, {
        params: { access_token: accessToken },
      })
      return res.data?.id ? 'connected' : 'disconnected'
    } catch {
      return 'disconnected'
    }
  }

  async sendText(channelId: string, to: string, text: string) {
    const { phoneNumberId, accessToken } = await this.getConfig(channelId)
    await axios.post(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: normalizeBrazilianNumber(to),
      type: 'text',
      text: { body: text },
    }, { headers: { Authorization: `Bearer ${accessToken}` } })
  }

  async sendMedia(channelId: string, to: string, mediaUrl: string, caption?: string) {
    const { phoneNumberId, accessToken } = await this.getConfig(channelId)
    const type = detectMediaType(mediaUrl)
    const body: Record<string, any> = { messaging_product: 'whatsapp', to: normalizeBrazilianNumber(to), type }
    if (type === 'image') body.image = { link: mediaUrl, caption }
    else if (type === 'video') body.video = { link: mediaUrl, caption }
    else body.document = { link: mediaUrl, caption, filename: caption || mediaUrl.split('/').pop() }

    await axios.post(`${GRAPH_URL}/${phoneNumberId}/messages`, body, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  }

  async sendAudio(channelId: string, to: string, audioUrl: string) {
    const { phoneNumberId, accessToken } = await this.getConfig(channelId)
    await axios.post(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: normalizeBrazilianNumber(to),
      type: 'audio',
      audio: { link: audioUrl },
    }, { headers: { Authorization: `Bearer ${accessToken}` } })
  }

  // Cloud API não aceita base64/data URL — precisa subir a mídia primeiro e enviar pelo media_id.
  async sendAudioBase64(channelId: string, to: string, audioBase64: string) {
    const { phoneNumberId, accessToken } = await this.getConfig(channelId)
    const buffer = Buffer.from(audioBase64, 'base64')

    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('file', new Blob([buffer], { type: 'audio/mpeg' }), 'audio.mp3')

    const uploadRes = await axios.post(`${GRAPH_URL}/${phoneNumberId}/media`, form, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const mediaId = uploadRes.data?.id
    if (!mediaId) throw new Error('Meta Cloud API não retornou media_id no upload de áudio')

    await axios.post(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: normalizeBrazilianNumber(to),
      type: 'audio',
      audio: { id: mediaId },
    }, { headers: { Authorization: `Bearer ${accessToken}` } })
  }

  parseWebhook(payload: any): WhatsAppMessage | null {
    const value = payload?.entry?.[0]?.changes?.[0]?.value
    const msg = value?.messages?.[0]
    if (!msg) return null

    const from = normalizeBrazilianNumber(msg.from || '')
    if (!from) return null

    const contact = value?.contacts?.[0]
    const name = contact?.profile?.name || 'Desconhecido'

    const text = msg.type === 'text' ? msg.text?.body : undefined

    let mediaType: WhatsAppMessage['mediaType'] | undefined
    let mediaId: string | undefined
    if (msg.type === 'image') { mediaType = 'image'; mediaId = msg.image?.id }
    else if (msg.type === 'audio') { mediaType = 'audio'; mediaId = msg.audio?.id }
    else if (msg.type === 'video') { mediaType = 'video'; mediaId = msg.video?.id }
    else if (msg.type === 'document') { mediaType = 'document'; mediaId = msg.document?.id }

    if (!text && !mediaType) return null

    return {
      from,
      name,
      text,
      mediaUrl: mediaId ? `meta-cloud:${mediaId}` : undefined,
      mediaType,
      messageId: msg.id || '',
      timestamp: msg.timestamp ? parseInt(msg.timestamp, 10) : Math.floor(Date.now() / 1000),
    }
  }

  async downloadMedia(mediaId: string, channelId?: string): Promise<{ fileURL?: string; transcription?: string; mimetype?: string; authHeader?: string }> {
    if (!channelId) return {}
    try {
      const { accessToken } = await this.getConfig(channelId)
      const metaRes = await axios.get(`${GRAPH_URL}/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const url = metaRes.data?.url
      const mimetype = metaRes.data?.mime_type
      if (!url) return {}

      // A URL de mídia da Meta exige o mesmo Bearer token para download.
      return { fileURL: url, mimetype, authHeader: `Bearer ${accessToken}` }
    } catch (err: any) {
      console.error('[META-CLOUD] downloadMedia ERRO:', err?.response?.data || err?.message)
      return {}
    }
  }
}

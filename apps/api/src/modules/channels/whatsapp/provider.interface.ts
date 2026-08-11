export interface WhatsAppMessage {
  from: string
  name: string
  text?: string
  mediaUrl?: string
  mediaType?: 'image' | 'audio' | 'video' | 'document'
  messageId: string
  timestamp: number
}

export interface WhatsAppProvider {
  createInstance(channelId: string): Promise<void>
  deleteInstance(channelId: string): Promise<void>
  getQRCode(channelId: string): Promise<string>
  getStatus(channelId: string): Promise<'connected' | 'disconnected' | 'qr_required'>
  // Retornam o ID da mensagem no provedor (wamid, na Meta Cloud API) quando
  // disponível — usado para permitir excluir a mensagem remotamente depois.
  sendText(channelId: string, to: string, text: string): Promise<string | null>
  sendMedia(channelId: string, to: string, mediaUrl: string, caption?: string): Promise<string | null>
  sendAudio(channelId: string, to: string, audioUrl: string): Promise<string | null>
  sendAudioBase64?(channelId: string, to: string, audioBase64: string): Promise<string | null>
  deleteMessage?(channelId: string, messageId: string): Promise<void>
  parseWebhook(payload: unknown): WhatsAppMessage | null
  downloadMedia?(messageId: string, channelId?: string): Promise<{ fileURL?: string; transcription?: string; mimetype?: string; authHeader?: string }>
}

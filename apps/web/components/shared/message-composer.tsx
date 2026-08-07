'use client'
import { useState, useRef, useCallback } from 'react'
import { Paperclip, Camera, Mic, Smile, Send, Loader2, Square, X, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

const EMOJIS = [
  '😀', '😂', '😊', '😍', '🥰', '😉', '😢', '😮', '😡', '👍',
  '👎', '🙏', '👏', '🎉', '❤️', '🔥', '✅', '❌', '⏰', '📌',
  '💰', '📄', '📷', '🎁', '🤝', '💬', '👋', '😴', '🤔', '😬',
]

type PendingAttachment = { file: File; mediaType: 'image' | 'audio' | 'document'; previewUrl?: string }

interface MessageComposerProps {
  conversationId: string
  onSent: () => void
}

export function MessageComposer({ conversationId, onSent }: MessageComposerProps) {
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<PendingAttachment | null>(null)
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const discardRecordingRef = useRef(false)

  const pickFileType = (file: File): 'image' | 'audio' | 'document' => {
    if (file.type.startsWith('image/')) return 'image'
    if (file.type.startsWith('audio/')) return 'audio'
    return 'document'
  }

  const handleFilePicked = (file: File | undefined) => {
    if (!file) return
    const mediaType = pickFileType(file)
    setPending({
      file,
      mediaType,
      previewUrl: mediaType === 'image' ? URL.createObjectURL(file) : undefined,
    })
  }

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      recordChunksRef.current = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false
          return
        }
        const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], 'audio.webm', { type: 'audio/webm' })
        setPending({ file, mediaType: 'audio' })
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    } catch {
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }, [])

  const stopRecording = useCallback((discard = false) => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    setRecording(false)
    discardRecordingRef.current = discard
    mediaRecorderRef.current?.stop()
  }, [])

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const clearPending = () => {
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl)
    setPending(null)
  }

  const handleSend = async () => {
    if (sending || (!message.trim() && !pending)) return
    setSending(true)
    try {
      let mediaUrl: string | undefined
      let mediaType: string | undefined

      if (pending) {
        const formData = new FormData()
        formData.append('file', pending.file)
        const res = await api.post(`/conversations/${conversationId}/attachments`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        mediaUrl = res.data.mediaUrl
        mediaType = res.data.mediaType
      }

      await api.post(`/conversations/${conversationId}/messages`, { content: message, mediaUrl, mediaType })
      setMessage('')
      clearPending()
      onSent()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-t border-gray-100">
      {pending && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 max-w-full">
            {pending.mediaType === 'image' && pending.previewUrl ? (
              <img src={pending.previewUrl} alt="Preview" className="w-10 h-10 rounded object-cover" />
            ) : pending.mediaType === 'audio' ? (
              <Mic className="w-4 h-4 text-gray-400 shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
            )}
            <span className="text-xs text-gray-600 truncate max-w-[180px]">{pending.file.name}</span>
            <button onClick={clearPending} className="text-gray-400 hover:text-red-500 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-2 px-4 pt-3 text-red-500 text-sm">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Gravando... {formatDuration(recordSeconds)}
          <button onClick={() => stopRecording(true)} className="text-gray-400 hover:text-red-500 ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="p-4 flex items-center gap-1.5 relative">
        {showEmoji && (
          <div className="absolute bottom-full left-4 mb-2 bg-white border border-gray-200 rounded-xl shadow-xl p-2 grid grid-cols-10 gap-1 z-10 w-72">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { setMessage((m) => m + emoji); setShowEmoji(false) }}
                className="text-lg hover:bg-gray-100 rounded p-1"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,.doc,.docx"
          onChange={(e) => { handleFilePicked(e.target.files?.[0]); e.target.value = '' }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { handleFilePicked(e.target.files?.[0]); e.target.value = '' }}
        />

        <button
          onClick={() => setShowEmoji((v) => !v)}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0"
          title="Emoji"
        >
          <Smile className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0"
          title="Anexar arquivo"
        >
          <Paperclip className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 shrink-0"
          title="Tirar foto"
        >
          <Camera className="w-4.5 h-4.5" />
        </button>

        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Digite sua mensagem..."
          onFocus={() => setShowEmoji(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && (message.trim() || pending)) {
              e.preventDefault()
              handleSend()
            }
          }}
        />

        <button
          onClick={recording ? () => stopRecording(false) : startRecording}
          className={cn(
            'p-2 rounded-lg shrink-0 transition-colors',
            recording ? 'text-white bg-red-500 hover:bg-red-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          )}
          title={recording ? 'Parar gravação' : 'Gravar áudio'}
        >
          {recording ? <Square className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
        </button>

        <Button
          onClick={handleSend}
          disabled={(!message.trim() && !pending) || sending || recording}
          className="bg-[#1565C0] hover:bg-[#0D47A1] shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  )
}

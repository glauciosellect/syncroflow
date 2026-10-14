'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/auth.store'

// Softphone WebRTC para ligações de voz RECEBIDAS (WhatsApp Business Calling API).
// A Meta manda a oferta SDP; o navegador responde com um SDP answer (áudio Opus) e a
// API do SyncroFlow faz pre_accept + accept. Só recebe — não há discagem.

interface IncomingCall {
  callId: string
  conversationId: string | null
  contactName: string
  phone: string
}

type Phase = 'ringing' | 'connecting' | 'active'

function formatTimer(total: number) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Espera a coleta de candidatos ICE terminar (a Meta não faz trickle ICE)
function waitIceComplete(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const done = () => { pc.removeEventListener('icegatheringstatechange', check); clearTimeout(t); resolve() }
    const check = () => { if (pc.iceGatheringState === 'complete') done() }
    const t = setTimeout(done, timeoutMs)
    pc.addEventListener('icegatheringstatechange', check)
  })
}

export function Softphone() {
  const workspaceId = useAuthStore((s) => s.workspace?.id)
  const token = useAuthStore((s) => s.token)
  const [call, setCall] = useState<IncomingCall | null>(null)
  const [phase, setPhase] = useState<Phase>('ringing')
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const callRef = useRef<IncomingCall | null>(null)
  const ringRef = useRef<{ ctx: AudioContext; timer: ReturnType<typeof setInterval> } | null>(null)

  const stopRing = useCallback(() => {
    if (ringRef.current) {
      clearInterval(ringRef.current.timer)
      ringRef.current.ctx.close().catch(() => {})
      ringRef.current = null
    }
  }, [])

  const startRing = useCallback(() => {
    stopRing()
    try {
      const ctx = new AudioContext()
      const beep = () => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 440
        gain.gain.value = 0.08
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(); osc.stop(ctx.currentTime + 0.6)
      }
      beep()
      ringRef.current = { ctx, timer: setInterval(beep, 2500) }
    } catch { /* navegador pode bloquear áudio sem interação — o aviso visual continua */ }
  }, [stopRing])

  const cleanup = useCallback(() => {
    stopRing()
    pcRef.current?.close()
    pcRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (audioRef.current) audioRef.current.srcObject = null
    callRef.current = null
    setCall(null); setMuted(false); setSeconds(0); setPhase('ringing')
  }, [stopRing])

  // Eventos do servidor
  useEffect(() => {
    if (!workspaceId || !token) return
    const s = getSocket()
    const onIncoming = (data: IncomingCall) => {
      // Já em ligação: ignora a segunda (ela segue tocando para os outros atendentes)
      if (callRef.current) return
      callRef.current = data
      setCall(data); setPhase('ringing'); setError(null); setSeconds(0)
      startRing()
    }
    const onEnded = (data: { callId: string }) => {
      if (callRef.current?.callId === data.callId) cleanup()
    }
    // Outro atendente pegou a ligação
    const onTaken = (data: { callId: string }) => {
      if (callRef.current?.callId === data.callId && !pcRef.current) cleanup()
    }
    s.on('call:incoming', onIncoming)
    s.on('call:ended', onEnded)
    s.on('call:taken', onTaken)
    return () => { s.off('call:incoming', onIncoming); s.off('call:ended', onEnded); s.off('call:taken', onTaken) }
  }, [workspaceId, token, startRing, cleanup])

  // Timer só corre com a ligação conectada
  useEffect(() => {
    if (phase !== 'active') return
    const t = setInterval(() => setSeconds((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [phase])

  // Libera microfone/conexão se o componente desmontar no meio da ligação
  useEffect(() => () => { stopRing(); pcRef.current?.close(); streamRef.current?.getTracks().forEach((t) => t.stop()) }, [stopRing])

  async function answer() {
    if (!call) return
    stopRing()
    setPhase('connecting'); setError(null)
    try {
      const { data } = await api.get(`/calls/${call.callId}`)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pcRef.current = pc
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      pc.ontrack = (ev) => { if (audioRef.current) { audioRef.current.srcObject = ev.streams[0]; audioRef.current.play().catch(() => {}) } }

      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
      const answerDesc = await pc.createAnswer()
      await pc.setLocalDescription(answerDesc)
      await waitIceComplete(pc)

      await api.post(`/calls/${call.callId}/accept`, { sdp: pc.localDescription!.sdp })
      setPhase('active')
    } catch (err: any) {
      const msg = err?.response?.data?.error
        || (err?.name === 'NotAllowedError' ? 'Permita o uso do microfone no navegador para atender.' : 'Não foi possível atender a ligação.')
      // Libera mídia, mas mantém o aviso com o erro à vista
      pcRef.current?.close(); pcRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
      setError(msg); setPhase('ringing')
      if (err?.response?.status === 409 || err?.response?.status === 404) cleanup()
    }
  }

  async function reject() {
    if (!call) return
    const id = call.callId
    cleanup()
    await api.post(`/calls/${id}/reject`).catch(() => {})
  }

  async function hangUp() {
    if (!call) return
    const id = call.callId
    cleanup()
    await api.post(`/calls/${id}/terminate`).catch(() => {})
  }

  function toggleMute() {
    const next = !muted
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next })
    setMuted(next)
  }

  return (
    <>
      <audio ref={audioRef} autoPlay />
      {call && (
        <div className="fixed bottom-4 right-4 z-[100] w-72 rounded-2xl bg-gray-900 text-white shadow-2xl p-4 space-y-3" role="alertdialog" aria-label="Ligação recebida">
          <div>
            <p className="text-xs uppercase tracking-wide text-emerald-400">
              {phase === 'ringing' ? 'Ligação recebida' : phase === 'connecting' ? 'Conectando…' : 'Em ligação'}
            </p>
            <p className="text-lg font-semibold truncate">{call.contactName}</p>
            <p className="text-sm text-gray-400">{call.phone}</p>
            {phase === 'active' && <p className="text-2xl font-mono mt-1">{formatTimer(seconds)}</p>}
            {call.conversationId && (
              <Link href={`/chat?conversationId=${call.conversationId}`} className="text-xs text-sky-400 hover:underline">Abrir conversa</Link>
            )}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            {phase === 'ringing' && (
              <>
                <button onClick={answer} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 py-2.5 text-sm font-semibold">
                  <Phone className="w-4 h-4" /> Atender
                </button>
                <button onClick={reject} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 hover:bg-red-600 py-2.5 text-sm font-semibold">
                  <PhoneOff className="w-4 h-4" /> Recusar
                </button>
              </>
            )}
            {phase === 'connecting' && (
              <div className="flex-1 flex items-center justify-center py-2.5"><Loader2 className="w-5 h-5 animate-spin" /></div>
            )}
            {phase === 'active' && (
              <>
                <button onClick={toggleMute} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${muted ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />} {muted ? 'Mudo' : 'Mute'}
                </button>
                <button onClick={hangUp} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 hover:bg-red-600 py-2.5 text-sm font-semibold">
                  <PhoneOff className="w-4 h-4" /> Desligar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

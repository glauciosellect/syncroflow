import OpenAI from 'openai'
import axios from 'axios'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { decrypt } from '../../lib/crypto'
import { prisma } from '../../lib/prisma'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Busca chave ElevenLabs do workspace (salva pelo usuário em Configurações → Integrações)
async function getElevenLabsConfig(workspaceId?: string): Promise<{ apiKey: string; voiceId: string } | null> {
  if (!workspaceId) {
    // Fallback: variáveis de ambiente globais
    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) {
      return { apiKey: process.env.ELEVENLABS_API_KEY, voiceId: process.env.ELEVENLABS_VOICE_ID }
    }
    return null
  }
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { elevenLabsKey: true, elevenLabsVoiceId: true } as any,
  }) as any
  if (!ws?.elevenLabsKey || !ws?.elevenLabsVoiceId) return null
  try {
    return { apiKey: decrypt(ws.elevenLabsKey), voiceId: ws.elevenLabsVoiceId }
  } catch {
    return null
  }
}

// Vozes OpenAI disponíveis para seleção pelo usuário
export const TTS_VOICES = {
  onyx:   { label: 'Homem — Grave e sóbrio (padrão)',   gender: 'male' },
  echo:   { label: 'Homem — Jovem e claro',              gender: 'male' },
  fable:  { label: 'Homem — Caloroso e narrativo',       gender: 'male' },
  alloy:  { label: 'Mulher — Neutra e profissional',     gender: 'female' },
  nova:   { label: 'Mulher — Jovem e animada',           gender: 'female' },
  shimmer:{ label: 'Mulher — Suave e elegante',          gender: 'female' },
} as const

export type TtsVoice = keyof typeof TTS_VOICES

export async function generateSpeech(text: string, workspaceId?: string, voice?: string): Promise<Buffer | null> {
  // Limpa markdown e emojis para soar melhor em áudio
  const cleanText = text
    .replace(/[*_~`#]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .trim()
    .slice(0, 4096)

  if (!cleanText) return null

  // ElevenLabs — qualidade superior, voz JARVIS real
  const elevenCfg = await getElevenLabsConfig(workspaceId)
  if (elevenCfg) {
    try {
      const res = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${elevenCfg.voiceId}`,
        {
          text: cleanText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.85,
            style: 0.2,
            use_speaker_boost: true,
          },
        },
        {
          headers: {
            'xi-api-key': elevenCfg.apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          responseType: 'arraybuffer',
          timeout: 30000,
        },
      )
      return Buffer.from(res.data)
    } catch (err: any) {
      console.error('[TTS] ElevenLabs falhou:', err?.response?.status, err?.response?.data ? Buffer.from(err.response.data).toString() : err?.message)
      // Fallback para OpenAI se ElevenLabs falhar
    }
  }

  // OpenAI TTS — usa a voz configurada no agente (padrão: onyx — masculina, grave)
  const selectedVoice = (voice && voice in TTS_VOICES) ? voice as TtsVoice : 'onyx'
  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: selectedVoice,
      input: cleanText,
      response_format: 'mp3',
      speed: 0.95,
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer
  } catch (err: any) {
    console.error('[TTS] OpenAI TTS falhou:', err?.message, err?.status)
    return null
  }
}

// Salva o buffer em arquivo temporário, executa a função com o path, depois limpa
export async function withTempAudioFile<T>(
  buffer: Buffer,
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const tmpPath = path.join(os.tmpdir(), `jarvis_${Date.now()}.mp3`)
  fs.writeFileSync(tmpPath, buffer)
  try {
    return await fn(tmpPath)
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

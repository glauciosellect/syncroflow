import ffmpeg from 'fluent-ffmpeg'
import { randomUUID } from 'crypto'
import { promises as fs, existsSync } from 'fs'
import os from 'os'
import path from 'path'

// fluent-ffmpeg tenta auto-detectar o binário via `which ffmpeg`, mas isso
// falha em alguns containers Alpine mesmo com o binário instalado (apk add
// ffmpeg coloca em /usr/bin/ffmpeg). Fixar o caminho explicitamente evita
// depender dessa detecção.
const FFMPEG_PATH = process.env.FFMPEG_PATH || '/usr/bin/ffmpeg'
const FFPROBE_PATH = process.env.FFPROBE_PATH || '/usr/bin/ffprobe'
const ffmpegFound = existsSync(FFMPEG_PATH)
if (ffmpegFound) ffmpeg.setFfmpegPath(FFMPEG_PATH)
else console.error(`[audio-convert] ffmpeg não encontrado em ${FFMPEG_PATH} — conversão de áudio vai falhar`)
if (existsSync(FFPROBE_PATH)) ffmpeg.setFfprobePath(FFPROBE_PATH)

// O navegador grava áudio em webm/opus, mas a Meta Cloud API só aceita
// aac, mp4, mpeg, amr ou ogg (container OGG com codec OPUS) para nota de voz.
// Converte via ffmpeg (binário instalado no Dockerfile) para ogg/opus.
export async function convertToOggOpus(inputBuffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir()
  const inputPath = path.join(tmpDir, `${randomUUID()}.webm`)
  const outputPath = path.join(tmpDir, `${randomUUID()}.ogg`)

  await fs.writeFile(inputPath, inputBuffer)

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libopus')
        .format('ogg')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath)
    })
    return await fs.readFile(outputPath)
  } finally {
    await fs.unlink(inputPath).catch(() => {})
    await fs.unlink(outputPath).catch(() => {})
  }
}

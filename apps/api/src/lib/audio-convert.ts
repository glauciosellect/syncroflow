import ffmpeg from 'fluent-ffmpeg'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

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

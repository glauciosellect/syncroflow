import { createWorker } from '../../lib/queue'
import { prisma } from '../../lib/prisma'
import { generateEmbedding, chunkText } from './ai.service'
import axios from 'axios'
import * as cheerio from 'cheerio'

// —— YouTube transcript extractor ————————————————————————————————————————

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?\s]+)/,
    /youtube\.com\/embed\/([^?\s]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

async function getYouTubeTranscript(videoId: string): Promise<string> {
  const pageRes = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
    timeout: 20000,
    headers: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
  })

  const html = pageRes.data as string
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/)
  if (!match) throw new Error('Não foi possível extrair dados do vídeo')

  let playerResponse: any
  try {
    playerResponse = JSON.parse(match[1])
  } catch {
    throw new Error('Erro ao processar dados do vídeo')
  }

  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks || tracks.length === 0) throw new Error('Este vídeo não possui legendas/transcrição disponível')

  const track = tracks.find((t: any) => t.languageCode?.startsWith('pt')) || tracks[0]
  const captionUrl = track.baseUrl + '&fmt=json3'

  const captionRes = await axios.get(captionUrl, { timeout: 15000 })
  const events: any[] = captionRes.data?.events || []

  const text = events
    .filter((e: any) => e.segs)
    .flatMap((e: any) => e.segs.map((s: any) => s.utf8 || ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) throw new Error('Transcrição vazia')
  return text
}

// —— Website crawler ————————————————————————————————————————————————————

function isSameDomain(base: string, link: string): boolean {
  try {
    const baseHost = new URL(base).hostname
    const linkHost = new URL(link).hostname
    return baseHost === linkHost
  } catch {
    return false
  }
}

function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).href
  } catch {
    return null
  }
}

async function crawlWebsite(startUrl: string, maxPages = 50): Promise<string> {
  const visited = new Set<string>()
  const queue: string[] = [startUrl]
  const allText: string[] = []

  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift()!
    const normalized = url.split('#')[0]
    if (visited.has(normalized)) continue
    visited.add(normalized)

    try {
      const res = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'SyncroFlow-Crawler/1.0' },
      })
      const $ = cheerio.load(res.data)
      $('script, style, nav, footer, header, aside').remove()
      const pageText = $('body').text().replace(/\s+/g, ' ').trim()
      if (pageText) allText.push(pageText)

      if (visited.size < maxPages) {
        $('a[href]').each((_: number, el: any) => {
          const href = $(el).attr('href')
          if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return
          const resolved = resolveUrl(url, href)
          if (resolved && isSameDomain(startUrl, resolved) && !visited.has(resolved.split('#')[0])) {
            queue.push(resolved)
          }
        })
      }
    } catch {
      // Ignorar páginas que falharem e continuar o crawl
    }
  }

  return allText.join('\n\n')
}

// —— Chunk → embedding → store ——————————————————————————————————————————

async function processAndStore(trainingId: string, text: string): Promise<number> {
  const chunks = await chunkText(text)
  let count = 0
  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk)
      await prisma.$executeRawUnsafe(
        `INSERT INTO "TrainingChunk" (id, "trainingId", content, embedding, "createdAt") VALUES (gen_random_uuid()::text, $1, $2, $3::vector, now())`,
        trainingId,
        chunk,
        `[${embedding.join(',')}]`
      )
      count++
    } catch {}
  }
  return count
}

// —— Worker ————————————————————————————————————————————————————————————

export function startTrainingWorker() {
  return createWorker<{ trainingId: string; type: string; agentId: string; extra?: { crawl?: boolean } }>(
    'training',
    async (job) => {
      const { trainingId, type, extra } = job.data

      await prisma.training.update({ where: { id: trainingId }, data: { status: 'PROCESSING' } })

      try {
        let text = ''

        if (type === 'TEXT') {
          const training = await prisma.training.findUnique({ where: { id: trainingId } })
          text = training?.content || ''

        } else if (type === 'WEBSITE') {
          const training = await prisma.training.findUnique({ where: { id: trainingId } })
          if (training?.url) {
            if (extra?.crawl) {
              text = await crawlWebsite(training.url)
            } else {
              const res = await axios.get(training.url, { timeout: 15000 })
              const $ = cheerio.load(res.data)
              $('script, style, nav, footer, header, aside').remove()
              text = $('body').text().replace(/\s+/g, ' ').trim()
            }
          }

        } else if (type === 'VIDEO') {
          const training = await prisma.training.findUnique({ where: { id: trainingId } })
          if (training?.url) {
            const videoId = extractYouTubeId(training.url)
            if (!videoId) throw new Error('Apenas URLs do YouTube são suportadas no momento')
            text = await getYouTubeTranscript(videoId)
          }

        } else if (type === 'DOCUMENT') {
          const training = await prisma.training.findUnique({ where: { id: trainingId } })
          text = training?.content || ''
        }

        if (!text) {
          await prisma.training.update({ where: { id: trainingId }, data: { status: 'DONE' } })
          return
        }

        const count = await processAndStore(trainingId, text)

        await prisma.training.update({
          where: { id: trainingId },
          data: { status: 'DONE', chunkCount: count },
        })
      } catch (err: any) {
        await prisma.training.update({
          where: { id: trainingId },
          data: { status: 'ERROR', errorMsg: err.message },
        })
      }
    },
    3
  )
}

import { createWorker } from '../../lib/queue'
import { prisma } from '../../lib/prisma'
import { generateEmbedding, chunkText } from './ai.service'
import axios from 'axios'
import * as cheerio from 'cheerio'

export function startTrainingWorker() {
  return createWorker<{ trainingId: string; type: string; agentId: string; extra?: any }>(
    'training',
    async (job) => {
      const { trainingId, type } = job.data

      await prisma.training.update({ where: { id: trainingId }, data: { status: 'PROCESSING' } })

      try {
        let text = ''

        if (type === 'TEXT') {
          const training = await prisma.training.findUnique({ where: { id: trainingId } })
          text = training?.content || ''
        } else if (type === 'WEBSITE') {
          const training = await prisma.training.findUnique({ where: { id: trainingId } })
          if (training?.url) {
            const res = await axios.get(training.url, { timeout: 15000 })
            const $ = cheerio.load(res.data)
            $('script, style, nav, footer, header').remove()
            text = $('body').text().replace(/\s+/g, ' ').trim()
          }
        } else if (type === 'DOCUMENT') {
          const training = await prisma.training.findUnique({ where: { id: trainingId } })
          text = training?.content || ''
        }

        if (!text) {
          await prisma.training.update({ where: { id: trainingId }, data: { status: 'DONE' } })
          return
        }

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

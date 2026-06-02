import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const isTLS = redisUrl.startsWith('rediss://')

export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: isTLS ? {} : undefined,
  enableReadyCheck: false,
})

export const messageQueue = new Queue('messages', { connection: redisConnection })
export const trainingQueue = new Queue('training', { connection: redisConnection })

export type MessageJobData = {
  channelId: string
  channelType: string
  payload: unknown
}

export type TrainingJobData = {
  trainingId: string
  type: 'TEXT' | 'WEBSITE' | 'VIDEO' | 'DOCUMENT'
  agentId: string
}

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  concurrency = 5
) {
  return new Worker<T>(queueName, processor, { connection: redisConnection, concurrency })
}

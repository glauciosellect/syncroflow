import { Queue, Worker, Job } from 'bullmq'

function parseRedisUrl(url: string) {
  const u = new URL(url)
  const isTLS = u.protocol === 'rediss:'
  return {
    host: u.hostname,
    port: Number(u.port) || 6379,
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: isTLS ? {} : undefined,
  }
}

const connection = parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379')

export const messageQueue = new Queue('messages', { connection })
export const trainingQueue = new Queue('training', { connection })

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
  return new Worker<T>(queueName, processor, { connection, concurrency })
}

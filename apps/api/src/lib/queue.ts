import { Queue, Worker, Job } from 'bullmq'

// BullMQ aceita objeto de conexão puro — não usar instância IORedis externa
// pois o BullMQ tem seu próprio ioredis interno com versão diferente
function getRedisConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379'
  try {
    const u = new URL(url)
    return {
      host: u.hostname,
      port: Number(u.port) || 6379,
      username: u.username || undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      tls: u.protocol === 'rediss:' ? {} : undefined,
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}

const connection = getRedisConnection()

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

import { Queue, Worker, Job } from 'bullmq'

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
}

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

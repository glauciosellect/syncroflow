import { Queue, Worker, Job } from 'bullmq'
import { redis } from './redis'

const connection = redis

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

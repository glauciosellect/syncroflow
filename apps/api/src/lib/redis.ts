import { Redis } from 'ioredis'

const redisUrl = process.env.REDIS_URL!
const isTLS = redisUrl.startsWith('rediss://')

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  tls: isTLS ? {} : undefined,
})

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message)
})

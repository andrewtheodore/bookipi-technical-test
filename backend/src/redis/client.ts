import Redis from 'ioredis';
import { config } from '../config.js';

export let redisAvailable = true;

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    // Reconnect after increasing delay, cap at 5 seconds
    return Math.min(times * 200, 5000);
  },
});

redis.on('error', (err) => {
  if (redisAvailable) {
    console.warn('Redis connection lost, falling back to DB-only mode:', err.message);
    redisAvailable = false;
  }
});

redis.on('connect', () => {
  if (!redisAvailable) {
    console.info('Redis reconnected, resuming cache layer');
  }
  redisAvailable = true;
});

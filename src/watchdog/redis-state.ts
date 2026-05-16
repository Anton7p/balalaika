import Redis from 'ioredis';
import type { WatchdogConfig } from './types';

export function createRedis(cfg: WatchdogConfig): Redis {
  return new Redis({
    host: cfg.redisHost,
    port: cfg.redisPort,
    password: cfg.redisPassword,
    maxRetriesPerRequest: 2,
  });
}

function failKey(inboundId: number): string {
  return `balalaika:watchdog:fail:${inboundId}`;
}

function okKey(inboundId: number): string {
  return `balalaika:watchdog:ok:${inboundId}`;
}

const LOCK_KEY = 'balalaika:watchdog:failover:lock';

export async function recordFail(
  redis: Redis,
  inboundId: number,
): Promise<number> {
  const n = await redis.incr(failKey(inboundId));
  await redis.expire(failKey(inboundId), 3600);
  await redis.del(okKey(inboundId));
  return n;
}

export async function recordOk(redis: Redis, inboundId: number): Promise<number> {
  const n = await redis.incr(okKey(inboundId));
  await redis.expire(okKey(inboundId), 3600);
  await redis.del(failKey(inboundId));
  return n;
}

export async function acquireFailoverLock(
  redis: Redis,
  inboundId: number,
  ttlSec: number,
): Promise<boolean> {
  const key = `${LOCK_KEY}:${inboundId}`;
  const res = await redis.set(key, '1', 'EX', ttlSec, 'NX');
  return res === 'OK';
}

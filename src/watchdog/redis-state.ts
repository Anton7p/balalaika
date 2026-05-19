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

function failKey(cfg: WatchdogConfig, inboundId: number): string {
  return `${cfg.appNamespace}:watchdog:fail:${inboundId}`;
}

function okKey(cfg: WatchdogConfig, inboundId: number): string {
  return `${cfg.appNamespace}:watchdog:ok:${inboundId}`;
}

function lockKey(cfg: WatchdogConfig): string {
  return `${cfg.appNamespace}:watchdog:failover:lock`;
}

function queueWorkingIndexKey(cfg: WatchdogConfig): string {
  return `${cfg.appNamespace}:vpn:queue:working_index`;
}

export async function readQueueWorkingIndex(
  redis: Redis,
  cfg: WatchdogConfig,
): Promise<number> {
  const raw = await redis.get(queueWorkingIndexKey(cfg));
  if (raw === null || raw.trim().length === 0) {
    return 0;
  }
  const n = Number.parseInt(raw, 10);
  return !Number.isNaN(n) && n >= 0 ? n : 0;
}

export async function recordFail(
  redis: Redis,
  cfg: WatchdogConfig,
  inboundId: number,
): Promise<number> {
  const n = await redis.incr(failKey(cfg, inboundId));
  await redis.expire(failKey(cfg, inboundId), 3600);
  await redis.del(okKey(cfg, inboundId));
  return n;
}

export async function recordOk(
  redis: Redis,
  cfg: WatchdogConfig,
  inboundId: number,
): Promise<number> {
  const n = await redis.incr(okKey(cfg, inboundId));
  await redis.expire(okKey(cfg, inboundId), 3600);
  await redis.del(failKey(cfg, inboundId));
  return n;
}

export async function acquireFailoverLock(
  redis: Redis,
  cfg: WatchdogConfig,
  inboundId: number,
  ttlSec: number,
): Promise<boolean> {
  const key = `${lockKey(cfg)}:${inboundId}`;
  const res = await redis.set(key, '1', 'EX', ttlSec, 'NX');
  return res === 'OK';
}

import type { Redis } from 'ioredis';

export interface RedisTelegrafSessionOptions {
  readonly keyPrefix: string;
  readonly ttlSeconds: number;
}

/** Хранилище сессий Telegraf в Redis с TTL (§6 .cursorrules). */
export class RedisTelegrafSessionStore<S extends Record<string, unknown>> {
  constructor(
    private readonly redis: Redis,
    private readonly options: RedisTelegrafSessionOptions,
  ) {}

  async get(key: string): Promise<S | undefined> {
    const raw = await this.redis.get(this.options.keyPrefix + key);
    if (raw === null) {
      return undefined;
    }
    try {
      return JSON.parse(raw) as S;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: S): Promise<void> {
    const payload = JSON.stringify(value);
    const ttl = this.options.ttlSeconds;
    if (ttl > 0) {
      await this.redis.set(this.options.keyPrefix + key, payload, 'EX', ttl);
      return;
    }
    await this.redis.set(this.options.keyPrefix + key, payload);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.options.keyPrefix + key);
  }
}

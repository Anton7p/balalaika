import type { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Context, MiddlewareFn } from 'telegraf';

export interface TelegramRateLimitOptions {
  readonly windowSeconds: number;
  readonly maxRequests: number;
  readonly keyPrefix: string;
}

/** Простое окно по счётчику на пользователя (rate limiting через Redis). */
export function createTelegramRateLimitMiddleware(
  redis: Redis,
  opts: TelegramRateLimitOptions,
  logger: Logger,
): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const uid = ctx.from?.id;
    if (uid === undefined) {
      await next();
      return;
    }
    const key = `${opts.keyPrefix}${uid}`;
    try {
      const n = await redis.incr(key);
      if (n === 1) {
        await redis.expire(key, opts.windowSeconds);
      }
      if (n > opts.maxRequests) {
        logger.warn(
          `telegram_rate_limited telegramUserId=${String(uid)} count=${String(n)}`,
        );
        if (ctx.callbackQuery !== undefined) {
          await ctx
            .answerCbQuery('Слишком часто. Подождите немного.')
            .catch(() => undefined);
        }
        return;
      }
    } catch (err) {
      logger.error(
        `telegram_rate_limit_redis_error ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    await next();
  };
}

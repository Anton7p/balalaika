import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { TelegrafModule } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import { session } from 'telegraf';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { VpnModule } from '../vpn/vpn.module';
import { AdminAccessService } from './admin-access.service';
import { AdminStatusService } from './admin-status.service';
import { AdminStatusUiAdapter } from './admin-status-ui.adapter';
import { createTelegramRateLimitMiddleware } from './middleware/telegram-rate-limit.middleware';
import { PurchaseScene } from './scenes/purchase.scene';
import { createTelegramApiAgent } from './telegram-proxy.agent';
import { RedisTelegrafSessionStore } from './redis-session.store';
import { SubscriptionReminderService } from './subscription-reminder.service';
import { TelegramAdminUpdate } from './updates/telegram-admin.update';
import { TelegramKeysUpdate } from './updates/telegram-keys.update';
import { TelegramNavigationUpdate } from './updates/telegram-navigation.update';
import { TelegramStartUpdate } from './updates/telegram-start.update';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    SubscriptionsModule,
    VpnModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService, redis: Redis) => {
        const ttl = Number(
          config.get<string>('TELEGRAM_SESSION_TTL_SECONDS') ?? '86400',
        );
        const prefix =
          config.get<string>('TELEGRAM_SESSION_KEY_PREFIX') ?? 'tg:sess:';
        const store = new RedisTelegrafSessionStore(redis, {
          ttlSeconds: ttl,
          keyPrefix: prefix,
        });

        const rlWindow = Number(
          config.get<string>('TELEGRAM_RL_WINDOW_SECONDS') ?? '60',
        );
        const rlMax = Number(config.get<string>('TELEGRAM_RL_MAX') ?? '40');
        const rlPrefix =
          config.get<string>('TELEGRAM_RL_KEY_PREFIX') ?? 'tg:rl:';
        const rlLogger = new Logger('TelegramRateLimit');

        const proxyUrlRaw = config.get<string>('TELEGRAM_PROXY_URL');
        const proxyUrl =
          proxyUrlRaw !== undefined && proxyUrlRaw.trim().length > 0
            ? proxyUrlRaw.trim()
            : undefined;
        const telegrafOptions =
          proxyUrl !== undefined
            ? {
                telegram: {
                  agent: createTelegramApiAgent(proxyUrl),
                },
              }
            : undefined;

        return {
          token: config.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
          options: telegrafOptions,
          middlewares: [
            session({
              store,
              defaultSession: (_ctx: Context) => ({}),
            }),
            createTelegramRateLimitMiddleware(
              redis,
              {
                windowSeconds: rlWindow,
                maxRequests: rlMax,
                keyPrefix: rlPrefix,
              },
              rlLogger,
            ),
          ],
        };
      },
    }),
  ],
  providers: [
    TelegramStartUpdate,
    TelegramNavigationUpdate,
    TelegramKeysUpdate,
    TelegramAdminUpdate,
    PurchaseScene,
    SubscriptionReminderService,
    AdminAccessService,
    AdminStatusUiAdapter,
    AdminStatusService,
  ],
})
export class TelegramModule {}

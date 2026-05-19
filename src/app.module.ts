import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AppNamespaceModule } from './common/app-namespace.module';
import { ContentConfigModule } from './common/content/content-config.module';
import { HttpGlobalExceptionFilter } from './common/filters/http-global.exception.filter';
import { PricingCatalogModule } from './catalog/pricing-catalog.module';
import { validateEnv } from './config/env.validation';
import { CryptoModule } from './crypto/crypto.module';
import { HealthModule } from './health/health.module';
import { InternalModule } from './internal/internal.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', '.env.local'],
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const level = config.get<string>('LOG_LEVEL') ?? 'info';
        const isProd = config.get<string>('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level,
            transport: isProd
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true },
                },
          },
        };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const passwordRaw = config.get<string>('REDIS_PASSWORD');
        const password =
          passwordRaw !== undefined && passwordRaw.length > 0
            ? passwordRaw
            : undefined;
        return {
          connection: {
            host: config.getOrThrow<string>('REDIS_HOST'),
            port: Number(config.getOrThrow<string>('REDIS_PORT')),
            password,
          },
        };
      },
    }),
    AppNamespaceModule,
    AuditModule,
    ContentConfigModule,
    PricingCatalogModule,
    RedisModule,
    CryptoModule,
    PrismaModule,
    UsersModule,
    SubscriptionsModule,
    TelegramModule,
    HealthModule,
    InternalModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpGlobalExceptionFilter,
    },
  ],
})
export class AppModule {}

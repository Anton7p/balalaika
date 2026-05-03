import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const passwordRaw = config.get<string>('REDIS_PASSWORD');
        const password =
          passwordRaw !== undefined && passwordRaw.length > 0
            ? passwordRaw
            : undefined;
        return new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: Number(config.getOrThrow<string>('REDIS_PORT')),
          password,
          maxRetriesPerRequest: 2,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

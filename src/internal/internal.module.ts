import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { VpnFailoverService } from '../vpn/vpn-failover.service';
import { VpnModule } from '../vpn/vpn.module';
import { InternalVpnController } from './internal-vpn.controller';

@Module({
  imports: [
    HttpModule.register({ timeout: 20000 }),
    VpnModule,
    PrismaModule,
    CryptoModule,
    RedisModule,
  ],
  providers: [VpnFailoverService],
  controllers: [InternalVpnController],
})
export class InternalModule {}

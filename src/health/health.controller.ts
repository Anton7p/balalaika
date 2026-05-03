import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { VpnProvisioningService } from '../vpn/vpn-provisioning.service';

export interface HealthChecksDto {
  database: boolean;
  redis: boolean;
  vpn: boolean;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly vpnProvisioning: VpnProvisioningService,
  ) {}

  @Get()
  async check(): Promise<{ status: string; checks: HealthChecksDto }> {
    const checks: HealthChecksDto = {
      database: false,
      redis: false,
      vpn: false,
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks,
      });
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG';
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks,
      });
    }

    try {
      checks.vpn = await this.vpnProvisioning.probeVpnIntegration();
    } catch {
      checks.vpn = false;
    }

    const status =
      checks.database && checks.redis && checks.vpn ? 'ok' : 'degraded';

    return { status, checks };
  }
}

import { Module } from '@nestjs/common';
import { VpnModule } from '../vpn/vpn.module';
import { HealthController } from './health.controller';

@Module({
  imports: [VpnModule],
  controllers: [HealthController],
})
export class HealthModule {}

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VpnFailoverService } from '../vpn/vpn-failover.service';
import { VpnFailoverDto } from './dto/vpn-failover.dto';

@Controller('internal/vpn')
export class InternalVpnController {
  constructor(
    private readonly config: ConfigService,
    private readonly vpnFailover: VpnFailoverService,
  ) {}

  @Post('failover')
  @HttpCode(200)
  async handleFailover(
    @Headers('x-watchdog-secret') secret: string | undefined,
    @Body() body: VpnFailoverDto,
  ): Promise<{ migrated: number; notified: number }> {
    const expected = this.config.get<string>('VPN_WATCHDOG_HOOK_SECRET');
    if (expected === undefined || expected.trim().length === 0) {
      throw new UnauthorizedException('VPN_WATCHDOG_HOOK_SECRET not configured');
    }
    if (secret !== expected) {
      throw new UnauthorizedException('invalid watchdog secret');
    }
    return await this.vpnFailover.applyFailover(body);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { REDIS_WORKING_INBOUND_IDS_KEY } from './vpn-routing.constants';

export interface InboundPickResult {
  readonly inboundId: number;
}

/**
 * Выбор inbound на master для новых клиентов: упорядоченный список рабочих + лимит клиентов.
 * Запасные inbound в env не участвуют — только failover вручную (см. docs/VPN_OPERATING_MODEL.md).
 */
@Injectable()
export class LoadBalancerService {
  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Порядок = приоритет; Redis после auto-failover, иначе env. */
  async workingInboundIdsAsync(): Promise<readonly number[]> {
    const fromRedis = await this.redis.get(REDIS_WORKING_INBOUND_IDS_KEY);
    if (fromRedis !== null && fromRedis.trim().length > 0) {
      return this.parseInboundIdList(fromRedis);
    }
    return this.workingInboundIdsFromEnv();
  }

  /** @deprecated используйте workingInboundIdsAsync */
  workingInboundIds(): readonly number[] {
    return this.workingInboundIdsFromEnv();
  }

  private workingInboundIdsFromEnv(): readonly number[] {
    const listRaw = this.config.get<string>('VPN_WORKING_INBOUND_IDS');
    if (listRaw !== undefined && listRaw.trim().length > 0) {
      return this.parseInboundIdList(listRaw);
    }
    const legacy = this.config.get<string>('VPN_PANEL_INBOUND_ID');
    if (legacy !== undefined && legacy.trim().length > 0) {
      const n = Number.parseInt(legacy, 10);
      if (!Number.isNaN(n) && n > 0) {
        return [n];
      }
    }
    const legacyNum = this.config.get<number>('VPN_PANEL_INBOUND_ID');
    if (typeof legacyNum === 'number' && Number.isFinite(legacyNum) && legacyNum > 0) {
      return [Math.floor(legacyNum)];
    }
    return [1];
  }

  clientLimitPerInbound(): number {
    const raw = this.config.get<string>('VPN_INBOUND_CLIENT_LIMIT');
    if (raw !== undefined && raw.trim().length > 0) {
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n) && n > 0) {
        return n;
      }
    }
    const num = this.config.get<number>('VPN_INBOUND_CLIENT_LIMIT');
    if (typeof num === 'number' && Number.isFinite(num) && num > 0) {
      return Math.floor(num);
    }
    return 200;
  }

  /**
   * @param clientCounts — число клиентов по inbound id (из панели).
   * @returns первый рабочий inbound с местом или undefined, если все заполнены.
   */
  async pickInboundForNewClient(
    clientCounts: ReadonlyMap<number, number>,
  ): Promise<InboundPickResult | undefined> {
    const limit = this.clientLimitPerInbound();
    for (const inboundId of await this.workingInboundIdsAsync()) {
      const count = clientCounts.get(inboundId) ?? 0;
      if (count < limit) {
        return { inboundId };
      }
    }
    return undefined;
  }

  private parseInboundIdList(raw: string): number[] {
    const ids: number[] = [];
    for (const part of raw.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const n = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(n) && n > 0) {
        ids.push(n);
      }
    }
    if (ids.length === 0) {
      throw new Error('VPN_WORKING_INBOUND_IDS: no valid inbound ids');
    }
    return ids;
  }
}

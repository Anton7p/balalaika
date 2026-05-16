import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../redis/redis.constants';
import type { ResolvedQueueNode } from './resolve-node-queue';
import { PanelNodeRegistryService } from './panel-node-registry.service';
import {
  REDIS_QUEUE_WORKING_INDEX_KEY,
  REDIS_WORKING_INBOUND_IDS_KEY,
} from './vpn-routing.constants';

@Injectable()
export class NodeQueueRoutingService {
  constructor(
    private readonly registry: PanelNodeRegistryService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectPinoLogger(NodeQueueRoutingService.name)
    private readonly log: PinoLogger,
  ) {}

  async getWorkingIndex(): Promise<number> {
    const raw = await this.redis.get(REDIS_QUEUE_WORKING_INDEX_KEY);
    if (raw === null || raw.trim().length === 0) {
      return 0;
    }
    const n = Number.parseInt(raw, 10);
    return !Number.isNaN(n) && n >= 0 ? n : 0;
  }

  async setWorkingIndex(index: number): Promise<void> {
    await this.redis.set(REDIS_QUEUE_WORKING_INDEX_KEY, String(index));
  }

  async resolveQueue(): Promise<ResolvedQueueNode[]> {
    return await this.registry.resolveQueueFromPanel();
  }

  async getWorkingNode(): Promise<ResolvedQueueNode> {
    const queue = await this.resolveQueue();
    const idx = await this.getWorkingIndex();
    const node = queue[idx];
    if (node === undefined) {
      throw new Error(
        `NODE_IPS queue: no node at index ${idx} (${queue.length} nodes)`,
      );
    }
    return node;
  }

  async getStandbyNode(): Promise<ResolvedQueueNode | undefined> {
    const queue = await this.resolveQueue();
    const idx = (await this.getWorkingIndex()) + 1;
    return queue[idx];
  }

  /** Текущий inbound для новых клиентов (режим NODE_IPS). */
  async currentWorkingInboundId(): Promise<number> {
    const node = await this.getWorkingNode();
    await this.redis.set(
      REDIS_WORKING_INBOUND_IDS_KEY,
      String(node.inboundId),
    );
    return node.inboundId;
  }

  /**
   * Лимит набран / нода мёртвая: сдвиг очереди (рабочая ← бывшая запасная).
   * @returns новый working inbound id
   */
  async advanceQueue(reason: 'limit' | 'failover'): Promise<number> {
    const queue = await this.resolveQueue();
    const prev = await this.getWorkingIndex();
    const next = prev + 1;
    if (next >= queue.length) {
      throw new Error(
        `NODE_IPS queue exhausted after index ${prev} (${reason}); add a node to NODE_IPS`,
      );
    }
    await this.setWorkingIndex(next);
    const node = queue[next];
    await this.redis.set(
      REDIS_WORKING_INBOUND_IDS_KEY,
      String(node.inboundId),
    );
    this.log.warn(
      {
        reason,
        prevIndex: prev,
        workingIndex: next,
        address: node.address,
        inboundId: node.inboundId,
      },
      'vpn_node_queue_advanced',
    );
    return node.inboundId;
  }

  /** После failover: рабочая = нода с inbound toInboundId. */
  async syncWorkingIndexToInbound(toInboundId: number): Promise<void> {
    const queue = await this.resolveQueue();
    const idx = queue.findIndex((n) => n.inboundId === toInboundId);
    if (idx < 0) {
      throw new Error(
        `failover target inbound ${toInboundId} not in NODE_IPS queue`,
      );
    }
    await this.setWorkingIndex(idx);
    await this.redis.set(
      REDIS_WORKING_INBOUND_IDS_KEY,
      String(toInboundId),
    );
    this.log.warn(
      { workingIndex: idx, inboundId: toInboundId },
      'vpn_node_queue_synced_after_failover',
    );
  }
}

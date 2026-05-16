import type { ResolvedQueueNode } from './resolve-node-queue';

export type WatchdogNodePool = 'working' | 'standby';

export interface WatchdogNodeConfig {
  readonly inboundId: number;
  readonly host: string;
  readonly port: number;
  readonly panelNodeId?: number;
  readonly pool: WatchdogNodePool;
}

/** NODE_IPS[workingIndex] = working; остальные в очереди — standby. */
export function queueToWatchdogNodes(
  queue: readonly ResolvedQueueNode[],
  workingIndex: number,
): WatchdogNodeConfig[] {
  return queue.map((n, i) => ({
    inboundId: n.inboundId,
    host: n.address,
    port: n.port,
    pool: i === workingIndex ? 'working' : 'standby',
    ...(n.panelNodeId !== undefined ? { panelNodeId: n.panelNodeId } : {}),
  }));
}

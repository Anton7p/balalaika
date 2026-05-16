import type { WatchdogNodeConfig } from '../vpn/build-watchdog-nodes';
import type { WatchdogPanelSession } from './panel-session';
import type { WatchdogConfig } from './types';

export type WatchdogMonitorRole = 'head' | 'carrying' | 'spare';

export interface MonitoredWatchdogNode extends WatchdogNodeConfig {
  readonly monitorRole: WatchdogMonitorRole;
}

/**
 * Кого пинговать в режиме NODE_IPS:
 * - по умолчанию: «голова» + standby inbound с клиентами (заполненные ноды);
 * - опционально: вся очередь (VPN_WATCHDOG_MONITOR_ALL_QUEUE).
 */
export async function selectMonitoredNodes(
  cfg: WatchdogConfig,
  nodes: readonly WatchdogNodeConfig[],
  panel: WatchdogPanelSession,
): Promise<MonitoredWatchdogNode[]> {
  if (cfg.nodeIpsRaw === undefined) {
    return nodes
      .filter((n) => n.pool === 'working')
      .map((n) => ({ ...n, monitorRole: 'head' as const }));
  }

  if (cfg.monitorAllQueue) {
    const working = nodes.find((n) => n.pool === 'working');
    return nodes.map((n) => ({
      ...n,
      monitorRole:
        n.inboundId === working?.inboundId
          ? ('head' as const)
          : ('spare' as const),
    }));
  }

  const working = nodes.find((n) => n.pool === 'working');
  if (working === undefined) {
    return [];
  }

  const standbys = nodes.filter((n) => n.pool === 'standby');
  const counts =
    cfg.monitorCarryingNodes && standbys.length > 0
      ? await panel.clientCounts(standbys.map((n) => n.inboundId))
      : new Map<number, number>();

  const out: MonitoredWatchdogNode[] = [
    { ...working, monitorRole: 'head' },
  ];

  for (const n of standbys) {
    if (!cfg.monitorCarryingNodes) {
      continue;
    }
    if ((counts.get(n.inboundId) ?? 0) > 0) {
      out.push({ ...n, monitorRole: 'carrying' });
    }
  }

  return out;
}

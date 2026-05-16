import type { WatchdogNodeConfig } from '../vpn/build-watchdog-nodes';

export type { WatchdogNodeConfig, WatchdogNodePool } from '../vpn/build-watchdog-nodes';

export interface WatchdogConfig {
  readonly enabled: boolean;
  readonly intervalSec: number;
  readonly failThreshold: number;
  readonly okThreshold: number;
  readonly tcpTimeoutMs: number;
  readonly panelUrl: string;
  readonly panelUser: string;
  readonly panelPassword: string;
  readonly hookSecret: string;
  readonly appHookUrl: string;
  readonly redisHost: string;
  readonly redisPort: number;
  readonly redisPassword?: string;
  /** Секрет NODE_IPS: ноды резолвятся через API панели на каждый tick. */
  readonly nodeIpsRaw?: string;
  /** Устаревший ручной JSON; не используется, если задан nodeIpsRaw. */
  readonly nodes: readonly WatchdogNodeConfig[];
  /**
   * NODE_IPS: пинговать все ноды в очереди (включая пустые запасные).
   * Иначе см. monitorCarryingNodes.
   */
  readonly monitorAllQueue: boolean;
  /**
   * NODE_IPS: пинговать текущую «голову» + standby inbound с клиентами на панели.
   */
  readonly monitorCarryingNodes: boolean;
}

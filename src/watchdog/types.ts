export type WatchdogNodePool = 'working' | 'standby';

export interface WatchdogNodeConfig {
  readonly inboundId: number;
  readonly host: string;
  readonly port: number;
  readonly panelNodeId?: number;
  readonly pool: WatchdogNodePool;
}

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
  readonly nodes: readonly WatchdogNodeConfig[];
}

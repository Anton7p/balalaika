import type { WatchdogConfig, WatchdogNodeConfig } from './types';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v.trim().length === 0) {
    throw new Error(`Missing env ${name}`);
  }
  return v.trim();
}

function envOptional(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v.trim().length === 0 ? undefined : v.trim();
}

function parseNodesJson(raw: string): WatchdogNodeConfig[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('VPN_WATCHDOG_NODES_JSON must be a JSON array');
  }
  const nodes: WatchdogNodeConfig[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const o = item as Record<string, unknown>;
    const inboundId = Number(o.inboundId);
    const host = String(o.host ?? '').trim();
    const port = Number(o.port);
    const pool = o.pool === 'standby' ? 'standby' : 'working';
    if (!Number.isFinite(inboundId) || inboundId < 1 || host.length === 0 || !Number.isFinite(port)) {
      throw new Error('Invalid watchdog node entry');
    }
    const panelNodeId =
      o.panelNodeId !== undefined ? Number(o.panelNodeId) : undefined;
    nodes.push({
      inboundId,
      host,
      port,
      pool,
      ...(panelNodeId !== undefined && Number.isFinite(panelNodeId)
        ? { panelNodeId }
        : {}),
    });
  }
  if (nodes.length === 0) {
    throw new Error('VPN_WATCHDOG_NODES_JSON: empty');
  }
  return nodes;
}

export function loadWatchdogConfig(): WatchdogConfig {
  const enabledRaw = envOptional('VPN_WATCHDOG_ENABLED') ?? 'true';
  const enabled = enabledRaw.toLowerCase() !== 'false' && enabledRaw !== '0';
  const panelUrl = env('VPN_PANEL_URL').replace(/\/+$/, '');
  const hookSecret =
    envOptional('VPN_WATCHDOG_HOOK_SECRET') ?? env('ENCRYPTION_KEY');
  const appPort = envOptional('PORT') ?? '3000';
  const appHookUrl =
    envOptional('VPN_WATCHDOG_APP_URL') ??
    `http://app:${appPort}/internal/vpn/failover`;

  return {
    enabled,
    intervalSec: Number(envOptional('VPN_WATCHDOG_INTERVAL_SEC') ?? '60'),
    failThreshold: Number(envOptional('VPN_WATCHDOG_FAIL_THRESHOLD') ?? '3'),
    okThreshold: Number(envOptional('VPN_WATCHDOG_OK_THRESHOLD') ?? '2'),
    tcpTimeoutMs: Number(envOptional('VPN_WATCHDOG_TCP_TIMEOUT_MS') ?? '5000'),
    panelUrl,
    panelUser: env('VPN_ADMIN_USERNAME'),
    panelPassword: env('VPN_ADMIN_PASSWORD'),
    hookSecret,
    appHookUrl,
    redisHost: env('REDIS_HOST'),
    redisPort: Number(env('REDIS_PORT')),
    redisPassword: envOptional('REDIS_PASSWORD'),
    nodes: parseNodesJson(env('VPN_WATCHDOG_NODES_JSON')),
  };
}

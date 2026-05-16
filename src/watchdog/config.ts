import { parseNodesJson } from './parse-nodes-json';
import type { WatchdogConfig } from './types';

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

  const nodeIpsRaw = envOptional('NODE_IPS');
  const nodesJson = envOptional('VPN_WATCHDOG_NODES_JSON');

  if (enabled && nodeIpsRaw === undefined && nodesJson === undefined) {
    throw new Error(
      'Watchdog enabled: set NODE_IPS (from GitHub secret at deploy) or VPN_WATCHDOG_NODES_JSON',
    );
  }

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
    nodeIpsRaw,
    nodes: nodesJson !== undefined ? parseNodesJson(nodesJson) : [],
  };
}

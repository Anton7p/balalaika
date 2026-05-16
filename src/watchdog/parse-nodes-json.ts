import type { WatchdogNodeConfig } from '../vpn/build-watchdog-nodes';

export function parseNodesJson(raw: string): WatchdogNodeConfig[] {
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
    if (
      !Number.isFinite(inboundId) ||
      inboundId < 1 ||
      host.length === 0 ||
      !Number.isFinite(port)
    ) {
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

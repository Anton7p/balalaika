import {
  FALLBACK_APP_NAMESPACE,
  nodeInboundRemarkPrefix,
} from '../common/app-namespace';

/** Порядок элементов NODE_IPS = очередь нод (0 — рабочая, 1 — запасная, …). */

export function parseOrderedNodeAddresses(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('NODE_IPS must be a JSON array');
  }
  const ips: string[] = [];
  for (const item of parsed) {
    if (typeof item === 'string') {
      const ip = item.trim();
      if (ip.length > 0) {
        ips.push(ip);
      }
      continue;
    }
    if (typeof item === 'object' && item !== null) {
      const addr = String((item as { address?: string }).address ?? '').trim();
      if (addr.length > 0) {
        ips.push(addr);
      }
    }
  }
  return ips;
}

export function inboundRemarkForIp(
  ip: string,
  prefix = nodeInboundRemarkPrefix(FALLBACK_APP_NAMESPACE),
): string {
  return `${prefix}-${ip.replace(/\./g, '-')}`;
}

export function masterNodeNameForIp(ip: string): string {
  return `node-${ip.replace(/\./g, '-')}`;
}

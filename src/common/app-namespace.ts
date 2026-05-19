/** Fallback when DOMAIN_NAME / APP_NAMESPACE are missing (local tools). */
export const FALLBACK_APP_NAMESPACE = 'vpnbot';

/** Slug from FQDN: vpn.example.com → vpn-example-com */
export function namespaceFromDomain(domain: string): string {
  let s = domain.trim().toLowerCase();
  if (s.length === 0) {
    return FALLBACK_APP_NAMESPACE;
  }
  s = s.replace(/^www\./, '');
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  if (s.length === 0) {
    return FALLBACK_APP_NAMESPACE;
  }
  return s.length > 63 ? s.slice(0, 63) : s;
}

export function sanitizeAppNamespace(value: string): string {
  let s = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  return s.length > 0 ? (s.length > 63 ? s.slice(0, 63) : s) : FALLBACK_APP_NAMESPACE;
}

export function resolveAppNamespace(opts: {
  appNamespace?: string | null;
  domainName?: string | null;
}): string {
  const explicit = opts.appNamespace?.trim();
  if (explicit && explicit.length > 0) {
    return sanitizeAppNamespace(explicit);
  }
  const domain = opts.domainName?.trim();
  if (domain && domain.length > 0) {
    return namespaceFromDomain(domain);
  }
  return FALLBACK_APP_NAMESPACE;
}

export function nodeInboundRemarkPrefix(namespace: string): string {
  return `${namespace}-node`;
}

export function panelUserAgent(
  namespace: string,
  role: 'bot' | 'watchdog' | 'deploy',
): string {
  return `Mozilla/5.0 (compatible; ${namespace}-${role}/1.0)`;
}

export function redisVpnWorkingInboundIdsKey(namespace: string): string {
  return `${namespace}:vpn:working_inbound_ids`;
}

export function redisVpnQueueWorkingIndexKey(namespace: string): string {
  return `${namespace}:vpn:queue:working_index`;
}

export function redisWatchdogFailKey(
  namespace: string,
  inboundId: number,
): string {
  return `${namespace}:watchdog:fail:${inboundId}`;
}

export function redisWatchdogOkKey(
  namespace: string,
  inboundId: number,
): string {
  return `${namespace}:watchdog:ok:${inboundId}`;
}

export function redisWatchdogFailoverLockKey(namespace: string): string {
  return `${namespace}:watchdog:failover:lock`;
}

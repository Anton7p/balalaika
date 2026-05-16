import axios from 'axios';
import type { WatchdogNodeConfig } from '../vpn/build-watchdog-nodes';
import { loadWatchdogConfig } from './config';
import { createPanelSession } from './panel-session';
import { resolveWatchdogNodesFromNodeIps } from './resolve-nodes-from-env';
import {
  acquireFailoverLock,
  createRedis,
  readQueueWorkingIndex,
  recordFail,
  recordOk,
} from './redis-state';
import {
  selectMonitoredNodes,
  type MonitoredWatchdogNode,
} from './select-monitored-nodes';
import { tcpProbe } from './tcp-check';
import type { WatchdogConfig } from './types';
import type { WatchdogPanelSession } from './panel-session';

async function checkNode(
  cfg: WatchdogConfig,
  node: WatchdogNodeConfig,
  panel: WatchdogPanelSession,
): Promise<boolean> {
  const tcpOk = await tcpProbe(node.host, node.port, cfg.tcpTimeoutMs);
  if (!tcpOk) {
    return false;
  }
  if (node.panelNodeId !== undefined && node.panelNodeId > 0) {
    return await panel.probeNode(node.panelNodeId);
  }
  return true;
}

async function callAppFailover(
  cfg: WatchdogConfig,
  fromInboundId: number,
  toInboundId: number,
): Promise<void> {
  await axios.post(
    cfg.appHookUrl,
    { fromInboundId, toInboundId },
    {
      headers: { 'x-watchdog-secret': cfg.hookSecret },
      timeout: 120000,
      validateStatus: (s) => s === 200,
    },
  );
}

/** Предпочитаем пустую запасную; иначе первую живую standby. */
async function pickHealthyStandby(
  cfg: WatchdogConfig,
  dead: WatchdogNodeConfig,
  nodes: readonly WatchdogNodeConfig[],
  panel: WatchdogPanelSession,
): Promise<WatchdogNodeConfig | undefined> {
  const standbys = nodes.filter(
    (n) => n.pool === 'standby' && n.inboundId !== dead.inboundId,
  );
  if (standbys.length === 0) {
    return undefined;
  }
  const counts = await panel.clientCounts(standbys.map((n) => n.inboundId));
  const ordered = [...standbys].sort(
    (a, b) => (counts.get(a.inboundId) ?? 0) - (counts.get(b.inboundId) ?? 0),
  );
  for (const n of ordered) {
    if (await checkNode(cfg, n, panel)) {
      return n;
    }
  }
  return undefined;
}

async function runFailover(
  cfg: WatchdogConfig,
  dead: WatchdogNodeConfig,
  panel: WatchdogPanelSession,
  redis: ReturnType<typeof createRedis>,
): Promise<void> {
  const nodes = await resolveNodes(cfg, redis);
  const standby = await pickHealthyStandby(cfg, dead, nodes, panel);
  if (standby === undefined) {
    console.error(
      `[watchdog] no healthy standby for dead inbound ${dead.inboundId}`,
    );
    return;
  }

  const locked = await acquireFailoverLock(redis, dead.inboundId, 600);
  if (!locked) {
    console.warn(`[watchdog] failover lock busy for inbound ${dead.inboundId}`);
    return;
  }

  console.warn(
    `[watchdog] failover ${dead.inboundId} (${dead.host}) -> ${standby.inboundId} (${standby.host})`,
  );

  panel.reset();
  const emails = await panel.listClientEmails(dead.inboundId);
  if (emails.length > 0) {
    await panel.copyClients(standby.inboundId, dead.inboundId, emails);
  }
  try {
    await panel.setInboundEnabled(dead.inboundId, false);
  } catch (err) {
    console.warn('[watchdog] setEnable dead inbound failed', err);
  }

  await callAppFailover(cfg, dead.inboundId, standby.inboundId);
  console.warn('[watchdog] failover completed, app hook OK');
}

async function resolveNodes(
  cfg: WatchdogConfig,
  redis: ReturnType<typeof createRedis>,
): Promise<readonly WatchdogNodeConfig[]> {
  if (cfg.nodeIpsRaw !== undefined) {
    const workingIndex = await readQueueWorkingIndex(redis);
    return await resolveWatchdogNodesFromNodeIps(
      cfg.panelUrl,
      cfg.panelUser,
      cfg.panelPassword,
      cfg.nodeIpsRaw,
      workingIndex,
    );
  }
  return cfg.nodes;
}

function monitorRoleTag(role: MonitoredWatchdogNode['monitorRole']): string {
  if (role === 'carrying') {
    return ' carrying';
  }
  if (role === 'spare') {
    return ' spare';
  }
  return ' head';
}

async function tick(cfg: WatchdogConfig): Promise<void> {
  const redis = createRedis(cfg);
  const panel = createPanelSession(
    cfg.panelUrl,
    cfg.panelUser,
    cfg.panelPassword,
  );

  const nodes = await resolveNodes(cfg, redis);
  const monitored = await selectMonitoredNodes(cfg, nodes, panel);

  for (const node of monitored) {
    try {
      const ok = await checkNode(cfg, node, panel);
      if (ok) {
        const okCount = await recordOk(redis, node.inboundId);
        if (okCount >= cfg.okThreshold) {
          console.log(
            `[watchdog] inbound ${node.inboundId} healthy (${node.host}:${node.port})${monitorRoleTag(node.monitorRole)}`,
          );
        }
        continue;
      }
      const fails = await recordFail(redis, node.inboundId);
      console.warn(
        `[watchdog] inbound ${node.inboundId} check failed (${fails}/${cfg.failThreshold})${monitorRoleTag(node.monitorRole)}`,
      );
      if (fails >= cfg.failThreshold) {
        await runFailover(cfg, node, panel, redis);
      }
    } catch (err) {
      console.error(`[watchdog] error checking inbound ${node.inboundId}`, err);
    }
  }

  await redis.quit();
}

export async function runWatchdog(): Promise<void> {
  const cfg = loadWatchdogConfig();
  if (!cfg.enabled) {
    console.log('[watchdog] VPN_WATCHDOG_ENABLED=false, exit');
    return;
  }
  const nodeSource = cfg.nodeIpsRaw !== undefined ? 'NODE_IPS+panel' : 'VPN_WATCHDOG_NODES_JSON';
  const monitorMode = cfg.nodeIpsRaw
    ? cfg.monitorAllQueue
      ? 'all-queue'
      : cfg.monitorCarryingNodes
        ? 'head+carrying'
        : 'head-only'
    : 'json-working';
  console.log(
    `[watchdog] start interval=${cfg.intervalSec}s source=${nodeSource} monitor=${monitorMode}`,
  );

  const loop = async () => {
    try {
      await tick(cfg);
    } catch (err) {
      console.error('[watchdog] tick failed', err);
    }
  };

  await loop();
  setInterval(() => {
    void loop();
  }, cfg.intervalSec * 1000);
}

import axios from 'axios';
import { loadWatchdogConfig } from './config';
import { createPanelSession } from './panel-session';
import { acquireFailoverLock, createRedis, recordFail, recordOk } from './redis-state';
import { tcpProbe } from './tcp-check';
import type { WatchdogConfig, WatchdogNodeConfig } from './types';

async function checkNode(
  cfg: WatchdogConfig,
  node: WatchdogNodeConfig,
  panel: ReturnType<typeof createPanelSession>,
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

async function runFailover(
  cfg: WatchdogConfig,
  dead: WatchdogNodeConfig,
  panel: ReturnType<typeof createPanelSession>,
  redis: ReturnType<typeof createRedis>,
): Promise<void> {
  let standby: WatchdogNodeConfig | undefined;
  for (const n of cfg.nodes) {
    if (n.pool !== 'standby' || n.inboundId === dead.inboundId) {
      continue;
    }
    if (await checkNode(cfg, n, panel)) {
      standby = n;
      break;
    }
  }
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

async function tick(cfg: WatchdogConfig): Promise<void> {
  const redis = createRedis(cfg);
  const panel = createPanelSession(
    cfg.panelUrl,
    cfg.panelUser,
    cfg.panelPassword,
  );

  const working = cfg.nodes.filter((n) => n.pool === 'working');
  for (const node of working) {
    try {
      const ok = await checkNode(cfg, node, panel);
      if (ok) {
        const okCount = await recordOk(redis, node.inboundId);
        if (okCount >= cfg.okThreshold) {
          console.log(
            `[watchdog] inbound ${node.inboundId} healthy (${node.host}:${node.port})`,
          );
        }
        continue;
      }
      const fails = await recordFail(redis, node.inboundId);
      console.warn(
        `[watchdog] inbound ${node.inboundId} check failed (${fails}/${cfg.failThreshold})`,
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
  console.log(
    `[watchdog] start interval=${cfg.intervalSec}s nodes=${cfg.nodes.length}`,
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

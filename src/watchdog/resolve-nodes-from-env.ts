import { queueToWatchdogNodes } from '../vpn/build-watchdog-nodes';
import { resolveNodeQueueFromLists } from '../vpn/resolve-node-queue';
import { parseOrderedNodeAddresses } from '../vpn/parse-node-ips';
import { createPanelSession } from './panel-session';
import type { WatchdogNodeConfig } from '../vpn/build-watchdog-nodes';

interface InboundRow {
  id?: number;
  remark?: string;
  port?: number;
}

interface PanelNodeRow {
  id?: number;
  name?: string;
  address?: string;
}

const REMARK_PREFIX =
  process.env.VPN_NODE_INBOUND_REMARK_PREFIX?.trim() || 'balalaika-node';
const PORT_BASE = (() => {
  const raw = process.env.VPN_NODE_INBOUND_PORT_BASE?.trim();
  if (raw !== undefined && raw.length > 0) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) {
      return n;
    }
  }
  return 9443;
})();

export async function resolveWatchdogNodesFromNodeIps(
  panelUrl: string,
  panelUser: string,
  panelPassword: string,
  nodeIpsRaw: string,
  workingIndex: number,
): Promise<WatchdogNodeConfig[]> {
  const addresses = parseOrderedNodeAddresses(nodeIpsRaw);
  if (addresses.length === 0) {
    throw new Error('NODE_IPS: empty after parse');
  }

  const panel = createPanelSession(panelUrl, panelUser, panelPassword);
  await panel.ensureLogin();

  const inboundsRes = await panel.getJson<{
    success?: boolean;
    obj?: InboundRow[];
  }>('/panel/api/inbounds/list');
  const nodesRes = await panel.getJson<{
    success?: boolean;
    obj?: PanelNodeRow[] | string;
  }>('/panel/api/nodes/list');

  let nodeRows: PanelNodeRow[] = [];
  const nodesObj = nodesRes.obj;
  if (typeof nodesObj === 'string') {
    nodeRows = JSON.parse(nodesObj) as PanelNodeRow[];
  } else if (Array.isArray(nodesObj)) {
    nodeRows = nodesObj;
  }

  const queue = resolveNodeQueueFromLists(
    addresses,
    inboundsRes.obj ?? [],
    nodeRows,
    { remarkPrefix: REMARK_PREFIX, portBase: PORT_BASE },
  );

  const idx =
    workingIndex >= 0 && workingIndex < queue.length ? workingIndex : 0;
  return queueToWatchdogNodes(queue, idx);
}

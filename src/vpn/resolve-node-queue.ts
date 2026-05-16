import {
  inboundRemarkForIp,
  masterNodeNameForIp,
  parseOrderedNodeAddresses,
} from './parse-node-ips';

export interface ResolvedQueueNode {
  readonly queueIndex: number;
  readonly address: string;
  readonly inboundId: number;
  readonly port: number;
  readonly panelNodeId?: number;
  readonly remark: string;
}

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

export function resolveNodeQueueFromLists(
  addresses: readonly string[],
  inbounds: readonly InboundRow[],
  nodeRows: readonly PanelNodeRow[],
  options: { remarkPrefix: string; portBase: number },
): ResolvedQueueNode[] {
  const { remarkPrefix, portBase } = options;
  const resolved: ResolvedQueueNode[] = [];

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const remark = inboundRemarkForIp(address, remarkPrefix);
    const inbound =
      inbounds.find((ib) => String(ib.remark ?? '') === remark) ?? undefined;
    const nodeName = masterNodeNameForIp(address);
    const panelNode =
      nodeRows.find(
        (n) =>
          String(n.address ?? '') === address ||
          String(n.name ?? '') === nodeName,
      ) ?? undefined;

    if (inbound?.id === undefined) {
      throw new Error(
        `No inbound on master for NODE_IPS[${i}] ${address} (expected remark ${remark}). Run deploy-nodes.`,
      );
    }

    const port =
      inbound.port !== undefined && Number(inbound.port) > 0
        ? Number(inbound.port)
        : portBase + i;

    resolved.push({
      queueIndex: i,
      address,
      inboundId: Number(inbound.id),
      port,
      remark,
      ...(panelNode?.id !== undefined
        ? { panelNodeId: Number(panelNode.id) }
        : {}),
    });
  }

  return resolved;
}

export { parseOrderedNodeAddresses };

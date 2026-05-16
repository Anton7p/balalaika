import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseOrderedNodeAddresses } from './parse-node-ips';
import {
  resolveNodeQueueFromLists,
  type ResolvedQueueNode,
} from './resolve-node-queue';
import { XuiPanelHttpClient } from './xui-panel-http.client';

export type { ResolvedQueueNode };

@Injectable()
export class PanelNodeRegistryService {
  constructor(
    private readonly config: ConfigService,
    private readonly panel: XuiPanelHttpClient,
  ) {}

  orderedAddressesFromEnv(): string[] {
    const raw = this.config.get<string>('NODE_IPS');
    if (raw === undefined || raw.trim().length === 0) {
      return [];
    }
    return parseOrderedNodeAddresses(raw);
  }

  usesNodeIpQueue(): boolean {
    return this.orderedAddressesFromEnv().length > 0;
  }

  remarkPrefix(): string {
    return (
      this.config.get<string>('VPN_NODE_INBOUND_REMARK_PREFIX') ??
      'balalaika-node'
    );
  }

  portBase(): number {
    const raw = this.config.get<string>('VPN_NODE_INBOUND_PORT_BASE');
    if (raw !== undefined && raw.trim().length > 0) {
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n) && n > 0) {
        return n;
      }
    }
    return 9443;
  }

  async resolveQueueFromPanel(): Promise<ResolvedQueueNode[]> {
    const addresses = this.orderedAddressesFromEnv();
    if (addresses.length === 0) {
      return [];
    }

    const inboundsRes = await this.panel.getJson<{
      success?: boolean;
      obj?: InboundRow[];
    }>(this.panel.apiPath('/panel/api/inbounds/list'));
    const nodesRes = await this.panel.getJson<{
      success?: boolean;
      obj?: PanelNodeRow[] | string;
    }>(this.panel.apiPath('/panel/api/nodes/list'));

    const inbounds = inboundsRes.obj ?? [];
    let nodeRows: PanelNodeRow[] = [];
    const nodesObj = nodesRes.obj;
    if (typeof nodesObj === 'string') {
      nodeRows = JSON.parse(nodesObj) as PanelNodeRow[];
    } else if (Array.isArray(nodesObj)) {
      nodeRows = nodesObj;
    }

    return resolveNodeQueueFromLists(addresses, inbounds, nodeRows, {
      remarkPrefix: this.remarkPrefix(),
      portBase: this.portBase(),
    });
  }
}

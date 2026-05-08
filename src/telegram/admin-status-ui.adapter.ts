import { Injectable } from '@nestjs/common';
import { MESSAGES } from '../common/content/messages';
import type { VpnNodeStatus } from '../vpn/vpn-admin-provider.interface';

export interface AdminStatusSnapshot {
  readonly appStatus: string;
  readonly nodes: readonly VpnNodeStatus[] | null;
}

@Injectable()
export class AdminStatusUiAdapter {
  render(snapshot: AdminStatusSnapshot): string {
    const lines: string[] = [MESSAGES.ADMIN_STATUS_TITLE];
    lines.push(MESSAGES.ADMIN_STATUS_APP(snapshot.appStatus));

    if (snapshot.nodes === null) {
      lines.push(MESSAGES.ADMIN_STATUS_NODES_ERROR);
      return lines.join('\n');
    }

    if (snapshot.nodes.length === 0) {
      lines.push(MESSAGES.ADMIN_STATUS_NODES_EMPTY);
      return lines.join('\n');
    }

    for (const node of snapshot.nodes) {
      lines.push(
        MESSAGES.ADMIN_STATUS_NODE_LINE(node.name, node.status, node.address),
      );
    }
    return lines.join('\n');
  }
}

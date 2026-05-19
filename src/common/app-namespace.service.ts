import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  nodeInboundRemarkPrefix,
  panelUserAgent,
  redisVpnQueueWorkingIndexKey,
  redisVpnWorkingInboundIdsKey,
  redisWatchdogFailKey,
  redisWatchdogFailoverLockKey,
  redisWatchdogOkKey,
  resolveAppNamespace,
} from './app-namespace';

@Injectable()
export class AppNamespaceService {
  readonly namespace: string;
  readonly nodeRemarkPrefix: string;

  constructor(private readonly config: ConfigService) {
    this.namespace = resolveAppNamespace({
      appNamespace: this.config.get<string>('APP_NAMESPACE'),
      domainName: this.config.get<string>('DOMAIN_NAME'),
    });
    const remarkOverride = this.config
      .get<string>('VPN_NODE_INBOUND_REMARK_PREFIX')
      ?.trim();
    this.nodeRemarkPrefix =
      remarkOverride && remarkOverride.length > 0
        ? remarkOverride
        : nodeInboundRemarkPrefix(this.namespace);
  }

  panelHttpUserAgent(role: 'bot' | 'watchdog' | 'deploy'): string {
    return panelUserAgent(this.namespace, role);
  }

  get redisWorkingInboundIdsKey(): string {
    return redisVpnWorkingInboundIdsKey(this.namespace);
  }

  get redisQueueWorkingIndexKey(): string {
    return redisVpnQueueWorkingIndexKey(this.namespace);
  }

  redisWatchdogFail(inboundId: number): string {
    return redisWatchdogFailKey(this.namespace, inboundId);
  }

  redisWatchdogOk(inboundId: number): string {
    return redisWatchdogOkKey(this.namespace, inboundId);
  }

  get redisWatchdogFailoverLock(): string {
    return redisWatchdogFailoverLockKey(this.namespace);
  }
}

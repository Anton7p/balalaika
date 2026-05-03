import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface BalancerTarget {
  readonly nodeId: string;
}

/**
 * Выбор целевой ноды; позже — политики по нагрузке и доступности (§5 .cursorrules).
 */
@Injectable()
export class LoadBalancerService {
  constructor(private readonly config: ConfigService) {}

  selectTarget(): BalancerTarget {
    const nodeId =
      this.config.get<string>('WHITE_LABEL_NODE_ID') ?? 'stub-node-a';
    return { nodeId };
  }
}

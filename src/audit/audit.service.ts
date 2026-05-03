import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessAuditPayload {
  readonly actorTelegramId?: bigint;
  readonly userId?: string;
  readonly action: string;
  readonly metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logAccess(params: AccessAuditPayload): Promise<void> {
    await this.prisma.accessAuditLog.create({
      data: {
        actorTelegramId: params.actorTelegramId ?? null,
        userId: params.userId ?? null,
        action: params.action,
        metadata:
          params.metadata === undefined
            ? undefined
            : (params.metadata as Prisma.InputJsonValue),
      },
      select: { id: true },
    });
  }
}

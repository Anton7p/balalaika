import { Injectable } from '@nestjs/common';
import type { User as TgUser } from '@telegraf/types';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertUserResult {
  readonly id: string;
  readonly telegramId: bigint;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromTelegram(from: TgUser): Promise<UpsertUserResult> {
    const row = await this.prisma.user.upsert({
      where: { telegramId: BigInt(from.id) },
      create: {
        telegramId: BigInt(from.id),
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
      },
      update: {
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
      },
      select: {
        id: true,
        telegramId: true,
      },
    });
    return {
      id: row.id,
      telegramId: row.telegramId,
    };
  }

  async findIdByTelegramId(telegramId: bigint): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** Бесплатный тест (planMonths = 0) доступен один раз на аккаунт. */
  async hasUsedFreeTrial(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { freeTrialUsedAt: true },
    });
    if (user?.freeTrialUsedAt !== null && user?.freeTrialUsedAt !== undefined) {
      return true;
    }

    const fromSub = await this.prisma.subscription.findFirst({
      where: { userId, planMonths: 0 },
      select: { startsAt: true },
      orderBy: { startsAt: 'asc' },
    });
    if (fromSub !== null) {
      await this.markFreeTrialUsed(userId, fromSub.startsAt);
      return true;
    }

    const fromAudit = await this.prisma.accessAuditLog.findFirst({
      where: {
        userId,
        action: {
          in: ['vpn_subscription_issued', 'vpn_subscription_extended'],
        },
        metadata: {
          path: ['planMonths'],
          equals: 0,
        },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    if (fromAudit !== null) {
      await this.markFreeTrialUsed(userId, fromAudit.createdAt);
      return true;
    }

    return false;
  }

  async markFreeTrialUsed(
    userId: string,
    usedAt: Date = new Date(),
  ): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, freeTrialUsedAt: null },
      data: { freeTrialUsedAt: usedAt },
    });
  }
}

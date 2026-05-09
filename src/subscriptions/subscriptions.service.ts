import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import dayjs from 'dayjs';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { CryptoService } from '../crypto/crypto.service';
import { PricingCatalogService } from '../catalog/pricing-catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUBSCRIPTION_HOOKS_QUEUE } from '../queues/subscription-hooks.queue';
import type { SubscriptionHookJobPayload } from './subscription-hooks.processor';
import { VpnProvisioningService } from '../vpn/vpn-provisioning.service';

export interface ActiveVpnPayload {
  readonly subscriptionId: string;
  readonly keyPlain: string;
  readonly expiresAt: Date;
}

export interface SubscriptionNotifyRow {
  readonly id: string;
  readonly expiresAt: Date;
  readonly telegramId: bigint;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly billing: BillingService,
    private readonly vpnProvisioning: VpnProvisioningService,
    private readonly audit: AuditService,
    private readonly pricingCatalog: PricingCatalogService,
    @InjectQueue(SUBSCRIPTION_HOOKS_QUEUE)
    private readonly hooksQueue: Queue<SubscriptionHookJobPayload>,
  ) {}

  labelForPlan(planMonths: number): string {
    return this.pricingCatalog.findPlanLabel(planMonths);
  }

  private computeExpiryEnd(planMonths: number): Date {
    let d = dayjs();
    if (planMonths === 0) {
      return d.add(3, 'day').toDate();
    }
    if (planMonths === 0.25) {
      return d.add(7, 'day').toDate();
    }
    const whole = Math.floor(planMonths);
    const remainder = planMonths - whole;
    d = d.add(whole, 'month');
    if (remainder > 0) {
      d = d.add(Math.round(remainder * 30), 'day');
    }
    return d.toDate();
  }

  async createSubscription(
    userId: string,
    planMonths: number,
    actorTelegramId?: bigint,
  ): Promise<{ expiresAt: Date; keyPlain: string }> {
    const idempotencyKey = randomUUID();
    await this.billing.confirmCheckout({
      userId,
      planMonths,
      idempotencyKey,
    });

    const keyPlain = await this.vpnProvisioning.provisionConnection(planMonths);
    const expiresAt = this.computeExpiryEnd(planMonths);
    const vpnPayloadCipher = this.crypto.encryptUtf8(keyPlain);

    const subscriptionId = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.subscription.deleteMany({
          where: { userId },
        });
        const row = await tx.subscription.create({
          data: {
            userId,
            planMonths,
            vpnPayloadCipher,
            expiresAt,
          },
          select: { id: true },
        });
        return row.id;
      },
    );

    await this.audit.logAccess({
      actorTelegramId,
      userId,
      action: 'vpn_subscription_issued',
      metadata: {
        planMonths,
        subscriptionId,
      },
    });

    await this.hooksQueue.add(
      'post-issue',
      {
        subscriptionId,
        userId,
      },
      { removeOnComplete: true },
    );

    return { expiresAt, keyPlain };
  }

  async getActiveForUser(userId: string): Promise<ActiveVpnPayload | null> {
    const now = new Date();
    const row = await this.prisma.subscription.findFirst({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: 'desc' },
      select: {
        id: true,
        vpnPayloadCipher: true,
        expiresAt: true,
      },
    });
    if (row === null) {
      return null;
    }
    const keyPlain = this.crypto.decryptUtf8(row.vpnPayloadCipher);
    return {
      subscriptionId: row.id,
      keyPlain,
      expiresAt: row.expiresAt,
    };
  }

  /** Активные подписки: до конца ≤24 ч, напоминание ещё не слали */
  async findNeedingExpiryReminder(now: Date): Promise<SubscriptionNotifyRow[]> {
    const soon = dayjs(now).add(24, 'hour').toDate();
    const rows = await this.prisma.subscription.findMany({
      where: {
        expiryReminderSentAt: null,
        expiresAt: { gt: now, lte: soon },
      },
      select: {
        id: true,
        expiresAt: true,
        user: { select: { telegramId: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      expiresAt: r.expiresAt,
      telegramId: r.user.telegramId,
    }));
  }

  async markExpiryReminderSent(subscriptionIds: string[]): Promise<void> {
    if (subscriptionIds.length === 0) {
      return;
    }
    await this.prisma.subscription.updateMany({
      where: { id: { in: subscriptionIds } },
      data: { expiryReminderSentAt: new Date() },
    });
  }

  /** Истекшие недавно (окно 7 суток), финальное уведомление ещё не слали */
  async findNeedingEndedNotice(now: Date): Promise<SubscriptionNotifyRow[]> {
    const weekAgo = dayjs(now).subtract(7, 'day').toDate();
    const rows = await this.prisma.subscription.findMany({
      where: {
        subscriptionEndedNotifiedAt: null,
        expiresAt: { lte: now, gte: weekAgo },
      },
      select: {
        id: true,
        expiresAt: true,
        user: { select: { telegramId: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      expiresAt: r.expiresAt,
      telegramId: r.user.telegramId,
    }));
  }

  async markSubscriptionEndedNotified(
    subscriptionIds: string[],
  ): Promise<void> {
    if (subscriptionIds.length === 0) {
      return;
    }
    await this.prisma.subscription.updateMany({
      where: { id: { in: subscriptionIds } },
      data: { subscriptionEndedNotifiedAt: new Date() },
    });
  }
}

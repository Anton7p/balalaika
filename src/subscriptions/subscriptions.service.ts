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

    const limitIp = this.pricingCatalog.findPlanDeviceLimit(planMonths);
    const now = new Date();
    const activeRow = await this.prisma.subscription.findFirst({
      where: {
        userId,
        expiresAt: { gt: now },
        panelClientUuid: { not: null },
        panelSubId: { not: null },
      },
      orderBy: { expiresAt: 'desc' },
      select: {
        id: true,
        expiresAt: true,
        panelClientUuid: true,
        panelSubId: true,
        panelInboundId: true,
      },
    });

    const canExtend =
      activeRow !== null &&
      (activeRow.panelClientUuid?.length ?? 0) > 0 &&
      (activeRow.panelSubId?.length ?? 0) > 0 &&
      activeRow.panelInboundId !== null &&
      activeRow.panelInboundId > 0;

    let subscriptionId: string;
    let expiresAt: Date;
    let keyPlain: string;
    let extended = false;

    if (canExtend) {
      extended = true;
      const provisioned = await this.vpnProvisioning.provisionConnection(
        planMonths,
        actorTelegramId,
        limitIp,
        {
          clientUuid: activeRow.panelClientUuid as string,
          subId: activeRow.panelSubId as string,
          panelInboundId: activeRow.panelInboundId as number,
        },
      );
      keyPlain = provisioned.connectionUri;
      expiresAt = new Date(provisioned.panelExpiryEpochMs);
      const vpnPayloadCipher = this.crypto.encryptUtf8(keyPlain);
      await this.prisma.subscription.update({
        where: { id: activeRow.id },
        data: {
          planMonths,
          vpnPayloadCipher,
          expiresAt,
          panelClientUuid: provisioned.panelClientUuid,
          panelSubId: provisioned.panelSubId,
          panelInboundId: provisioned.panelInboundId,
          expiryReminderSentAt: null,
          subscriptionEndedNotifiedAt: null,
        },
      });
      subscriptionId = activeRow.id;
    } else {
      const provisioned = await this.vpnProvisioning.provisionConnection(
        planMonths,
        actorTelegramId,
        limitIp,
      );
      keyPlain = provisioned.connectionUri;
      expiresAt = new Date(provisioned.panelExpiryEpochMs);
      const vpnPayloadCipher = this.crypto.encryptUtf8(keyPlain);

      subscriptionId = await this.prisma.$transaction(
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
              panelClientUuid: provisioned.panelClientUuid,
              panelSubId: provisioned.panelSubId,
              panelInboundId: provisioned.panelInboundId,
            },
            select: { id: true },
          });
          return row.id;
        },
      );
    }

    await this.audit.logAccess({
      actorTelegramId,
      userId,
      action: extended ? 'vpn_subscription_extended' : 'vpn_subscription_issued',
      metadata: {
        planMonths,
        subscriptionId,
        extended,
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

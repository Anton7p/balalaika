import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectBot } from 'nestjs-telegraf';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Context, Telegraf } from 'telegraf';
import { NOTIFY_HTML } from '../common/content/notify-html';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { formatRuDateTime } from './helpers/format-expiry';

@Injectable()
export class SubscriptionReminderService {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    @InjectBot() private readonly bot: Telegraf<Context>,
    @InjectPinoLogger(SubscriptionReminderService.name)
    private readonly log: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async dispatchExpiryNotifications(): Promise<void> {
    const now = new Date();
    await this.sendExpiringSoon(now);
    await this.sendSubscriptionEnded(now);
  }

  private async sendExpiringSoon(now: Date): Promise<void> {
    const rows = await this.subscriptions.findNeedingExpiryReminder(now);
    const marked: string[] = [];
    for (const row of rows) {
      try {
        const until = formatRuDateTime(row.expiresAt);
        await this.bot.telegram.sendMessage(
          String(row.telegramId),
          NOTIFY_HTML.SUBSCRIPTION_EXPIRING_SOON(until),
          { parse_mode: 'HTML' },
        );
        marked.push(row.id);
      } catch (err: unknown) {
        this.log.warn(
          { err, subscriptionId: row.id, telegramId: String(row.telegramId) },
          'subscription_expiry_reminder_send_failed',
        );
      }
    }
    await this.subscriptions.markExpiryReminderSent(marked);
  }

  private async sendSubscriptionEnded(now: Date): Promise<void> {
    const rows = await this.subscriptions.findNeedingEndedNotice(now);
    const marked: string[] = [];
    for (const row of rows) {
      try {
        await this.bot.telegram.sendMessage(
          String(row.telegramId),
          NOTIFY_HTML.SUBSCRIPTION_ENDED(),
          { parse_mode: 'HTML' },
        );
        marked.push(row.id);
      } catch (err: unknown) {
        this.log.warn(
          { err, subscriptionId: row.id, telegramId: String(row.telegramId) },
          'subscription_ended_notify_send_failed',
        );
      }
    }
    await this.subscriptions.markSubscriptionEndedNotified(marked);
  }
}

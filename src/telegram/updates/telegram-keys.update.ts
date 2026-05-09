import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Action, Command, Ctx, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import { ACTIONS } from '../../common/content/actions';
import {
  emptyKeysKeyboard,
  keyDisplayKeyboard,
} from '../../common/content/keyboards/clean-keyboards';
import { MESSAGES } from '../../common/content/messages';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { UsersService } from '../../users/users.service';
import { formatRuDateTime } from '../helpers/format-expiry';

@Update()
@Injectable()
export class TelegramKeysUpdate {
  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    @InjectPinoLogger(TelegramKeysUpdate.name)
    private readonly log: PinoLogger,
  ) {}

  @Command('key')
  async onKeyCmd(@Ctx() ctx: Context): Promise<void> {
    await this.sendMyKeysScreen(ctx);
  }

  @Action(ACTIONS.MY_KEYS)
  async onMyKeys(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery().catch(() => undefined);
    await this.sendMyKeysScreen(ctx);
  }

  @Action(ACTIONS.COPY_KEY)
  async onCopyKey(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery().catch(() => undefined);
    try {
      if (ctx.from === undefined) {
        return;
      }
      const userId = await this.usersService.findIdByTelegramId(
        BigInt(ctx.from.id),
      );
      if (userId === null) {
        await ctx.reply(MESSAGES.COPY_KEY_ERROR);
        return;
      }
      const active = await this.subscriptionsService.getActiveForUser(userId);
      if (active === null) {
        await ctx.reply(MESSAGES.COPY_KEY_ERROR);
        return;
      }
      await ctx.reply(MESSAGES.COPY_KEY_READY(active.keyPlain), {
        parse_mode: 'Markdown',
      });
    } catch (err) {
      this.log.error({ err }, 'telegram_copy_key_failed');
      await ctx.reply(MESSAGES.ERROR);
    }
  }

  private async sendMyKeysScreen(ctx: Context): Promise<void> {
    try {
      if (ctx.from === undefined) {
        return;
      }
      const user = await this.usersService.upsertFromTelegram(ctx.from);
      const active = await this.subscriptionsService.getActiveForUser(user.id);
      if (active === null) {
        await ctx.reply(MESSAGES.NO_KEY, {
          reply_markup: emptyKeysKeyboard().reply_markup,
        });
        return;
      }
      const until = formatRuDateTime(active.expiresAt);
      await ctx.reply(MESSAGES.MY_KEYS_ACTIVE(until, active.keyPlain), {
        parse_mode: 'Markdown',
        reply_markup: keyDisplayKeyboard().reply_markup,
      });
    } catch (err) {
      this.log.error({ err }, 'telegram_my_keys_failed');
      await ctx.reply(MESSAGES.ERROR);
    }
  }
}

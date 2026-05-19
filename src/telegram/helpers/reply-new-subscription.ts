import type { PinoLogger } from 'nestjs-pino';
import type { Context } from 'telegraf';
import { Scenes } from 'telegraf';
import dayjs from 'dayjs';
import { MESSAGES } from '../../common/content/messages';
import {
  durationKeyboard,
  extendSuccessKeyboard,
  keyDisplayKeyboard,
} from '../../common/content/keyboards/clean-keyboards';
import type { PricingCatalogService } from '../../catalog/pricing-catalog.service';
import { FreeTrialAlreadyUsedError } from '../../subscriptions/errors/free-trial-already-used.error';
import type { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import type { UsersService } from '../../users/users.service';

export async function replyWithNewSubscription(
  ctx: Context,
  planMonths: number,
  deps: {
    readonly usersService: UsersService;
    readonly subscriptionsService: SubscriptionsService;
    readonly pricingCatalog: PricingCatalogService;
    readonly log: PinoLogger;
  },
): Promise<void> {
  await ctx.answerCbQuery().catch(() => undefined);
  try {
    if (ctx.from === undefined) {
      return;
    }
    const user = await deps.usersService.upsertFromTelegram(ctx.from);
    const { keyPlain, expiresAt, extended } =
      await deps.subscriptionsService.createSubscription(
        user.id,
        planMonths,
        BigInt(ctx.from.id),
      );
    const label = deps.pricingCatalog.findPlanLabel(planMonths);
    const expiryLabel = dayjs(expiresAt).format('DD.MM.YYYY HH:mm');
    const text = extended
      ? MESSAGES.EXTEND_SUCCESS(expiryLabel)
      : MESSAGES.KEY_READY(label, keyPlain);
    const replyMarkup = extended
      ? extendSuccessKeyboard().reply_markup
      : keyDisplayKeyboard().reply_markup;
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: replyMarkup,
    });
    await (ctx as Scenes.SceneContext).scene.leave().catch(() => undefined);
  } catch (err) {
    if (FreeTrialAlreadyUsedError.is(err)) {
      await ctx
        .answerCbQuery('Бесплатный тест уже был активирован', { show_alert: true })
        .catch(() => undefined);
      await ctx.reply(MESSAGES.FREE_TRIAL_ALREADY_USED, {
        reply_markup: durationKeyboard({ includeFreeTrial: false }).reply_markup,
      });
      return;
    }
    deps.log.error({ err, planMonths }, 'telegram_issue_subscription_failed');
    await ctx.reply(MESSAGES.ERROR);
  }
}

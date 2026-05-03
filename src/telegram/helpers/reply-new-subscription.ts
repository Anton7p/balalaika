import type { PinoLogger } from 'nestjs-pino';
import type { Context } from 'telegraf';
import { Scenes } from 'telegraf';
import { MESSAGES } from '../../common/content/messages';
import { keyDisplayKeyboard } from '../../common/content/keyboards/clean-keyboards';
import type { PricingCatalogService } from '../../catalog/pricing-catalog.service';
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
    const { keyPlain } = await deps.subscriptionsService.createSubscription(
      user.id,
      planMonths,
      BigInt(ctx.from.id),
    );
    const label = deps.pricingCatalog.findPlanLabel(planMonths);
    await ctx.reply(MESSAGES.KEY_READY(label, keyPlain), {
      parse_mode: 'Markdown',
      reply_markup: keyDisplayKeyboard().reply_markup,
    });
    await (ctx as Scenes.SceneContext).scene.leave().catch(() => undefined);
  } catch (err) {
    deps.log.error({ err, planMonths }, 'telegram_issue_subscription_failed');
    await ctx.reply(MESSAGES.ERROR);
  }
}

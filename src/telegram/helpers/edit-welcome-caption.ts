import type { PinoLogger } from 'nestjs-pino';
import type { Context } from 'telegraf';
import type { InlineKeyboardMarkup } from 'telegraf/types';
import { MESSAGES } from '../../common/content/messages';

export async function editWelcomeCaption(
  ctx: Context,
  caption: string,
  keyboard: { reply_markup: InlineKeyboardMarkup },
  log: PinoLogger,
): Promise<void> {
  await ctx.answerCbQuery().catch(() => undefined);
  try {
    const msg = ctx.callbackQuery?.message;
    if (
      msg !== undefined &&
      'photo' in msg &&
      Array.isArray(msg.photo) &&
      msg.photo.length > 0
    ) {
      await ctx.editMessageCaption(caption, {
        reply_markup: keyboard.reply_markup,
      });
      return;
    }
    await ctx.reply(caption, {
      reply_markup: keyboard.reply_markup,
    });
  } catch (err) {
    log.error({ err }, 'telegram_edit_welcome_caption_failed');
    await ctx.reply(MESSAGES.ERROR);
  }
}

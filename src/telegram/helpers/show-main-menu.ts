import fs from 'node:fs';
import type { PinoLogger } from 'nestjs-pino';
import type { Context } from 'telegraf';
import { Input } from 'telegraf';
import { mainKeyboard } from '../../common/content/keyboards/clean-keyboards';
import { MESSAGES } from '../../common/content/messages';
import { resolveMainMenuPhotoPath } from '../../common/content/media';

/** Главное меню: подпись «Добро пожаловать» + картинка из assets (как при /start). */
export async function showMainMenu(ctx: Context, log: PinoLogger): Promise<void> {
  await ctx.answerCbQuery().catch(() => undefined);
  const caption = MESSAGES.MAIN_TITLE;
  const reply_markup = mainKeyboard().reply_markup;
  const photoPath = resolveMainMenuPhotoPath();

  try {
    const msg = ctx.callbackQuery?.message;

    if (
      msg !== undefined &&
      'photo' in msg &&
      Array.isArray(msg.photo) &&
      msg.photo.length > 0
    ) {
      await ctx.editMessageCaption(caption, { reply_markup });
      return;
    }

    if (msg !== undefined && fs.existsSync(photoPath)) {
      try {
        await ctx.editMessageMedia(
          {
            type: 'photo',
            media: Input.fromLocalFile(photoPath),
            caption,
          },
          { reply_markup },
        );
        return;
      } catch (mediaErr: unknown) {
        log.warn({ err: mediaErr }, 'telegram_edit_main_menu_media_fallback');
      }
    }

    if (fs.existsSync(photoPath)) {
      await ctx.replyWithPhoto(Input.fromLocalFile(photoPath), {
        caption,
        reply_markup,
      });
      return;
    }

    await ctx.reply(caption, { reply_markup });
  } catch (err: unknown) {
    log.error({ err }, 'telegram_show_main_menu_failed');
    await ctx.reply(MESSAGES.ERROR);
  }
}

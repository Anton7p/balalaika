import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Action, Ctx, Start, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import { Input } from 'telegraf';
import { Scenes } from 'telegraf';
import { ACTIONS } from '../../common/content/actions';
import { MESSAGES } from '../../common/content/messages';
import { mainKeyboard } from '../../common/content/keyboards/clean-keyboards';
import { ContentLinksService } from '../../common/content/content-links.service';
import { resolveMainMenuPhotoPath } from '../../common/content/media';
import { UsersService } from '../../users/users.service';
import { showMainMenu } from '../helpers/show-main-menu';

@Update()
@Injectable()
export class TelegramStartUpdate {
  constructor(
    private readonly usersService: UsersService,
    private readonly contentLinks: ContentLinksService,
    @InjectPinoLogger(TelegramStartUpdate.name)
    private readonly log: PinoLogger,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    try {
      if (ctx.from === undefined) {
        return;
      }
      await this.usersService.upsertFromTelegram(ctx.from);
      const photoPath = resolveMainMenuPhotoPath();
      await ctx.replyWithPhoto(Input.fromLocalFile(photoPath), {
        caption: MESSAGES.MAIN_TITLE,
        reply_markup: mainKeyboard(
          this.contentLinks.resolveSupportContactUrl(),
        ).reply_markup,
      });
    } catch (err) {
      this.log.error({ err }, 'telegram_start_failed');
      await ctx.reply(MESSAGES.ERROR);
    }
  }

  @Action(ACTIONS.START_MENU)
  async onBackToMain(@Ctx() ctx: Context): Promise<void> {
    await (ctx as Scenes.SceneContext).scene.leave().catch(() => undefined);
    await showMainMenu(ctx, this.log, this.contentLinks);
  }
}

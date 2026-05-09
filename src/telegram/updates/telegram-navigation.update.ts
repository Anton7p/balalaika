import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Action, Command, Ctx, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import { Scenes } from 'telegraf';
import { ACTIONS } from '../../common/content/actions';
import {
  durationKeyboard,
  legalKeyboard,
  platformKeyboard,
} from '../../common/content/keyboards/clean-keyboards';
import { MESSAGES } from '../../common/content/messages';
import { ContentLinksService } from '../../common/content/content-links.service';
import { TELEGRAM_SCENE_PURCHASE } from '../constants';
import { editWelcomeCaption } from '../helpers/edit-welcome-caption';

@Update()
@Injectable()
export class TelegramNavigationUpdate {
  constructor(
    private readonly contentLinks: ContentLinksService,
    @InjectPinoLogger(TelegramNavigationUpdate.name)
    private readonly log: PinoLogger,
  ) {}

  @Command('help')
  async onHelp(@Ctx() ctx: Context): Promise<void> {
    const guides = this.contentLinks.getPlatformGuides();
    await ctx.reply(MESSAGES.INSTRUCTIONS_TITLE, {
      reply_markup: platformKeyboard(guides).reply_markup,
    });
  }

  @Command('support')
  async onSupportCmd(@Ctx() ctx: Context): Promise<void> {
    const legal = this.contentLinks.getLegalLinks();
    await ctx.reply(MESSAGES.SUPPORT, {
      reply_markup: legalKeyboard(legal).reply_markup,
    });
  }

  @Action(ACTIONS.BUY_MENU)
  async onBuyMenu(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery().catch(() => undefined);
    await (ctx as Scenes.SceneContext).scene.enter(TELEGRAM_SCENE_PURCHASE);
  }

  @Action(ACTIONS.INSTRUCTIONS)
  async onInstructions(@Ctx() ctx: Context): Promise<void> {
    const guides = this.contentLinks.getPlatformGuides();
    await editWelcomeCaption(
      ctx,
      MESSAGES.INSTRUCTIONS_TITLE,
      platformKeyboard(guides),
      this.log,
    );
  }

  @Action(ACTIONS.LEGAL)
  async onLegal(@Ctx() ctx: Context): Promise<void> {
    const legal = this.contentLinks.getLegalLinks();
    await editWelcomeCaption(
      ctx,
      MESSAGES.SUPPORT,
      legalKeyboard(legal),
      this.log,
    );
  }
}

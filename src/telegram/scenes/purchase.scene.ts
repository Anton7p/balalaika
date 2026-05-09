import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Action, Ctx, Scene, SceneEnter } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import { ACTIONS } from '../../common/content/actions';
import { durationKeyboard } from '../../common/content/keyboards/clean-keyboards';
import { MESSAGES } from '../../common/content/messages';
import { PricingCatalogService } from '../../catalog/pricing-catalog.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { UsersService } from '../../users/users.service';
import { TELEGRAM_SCENE_PURCHASE } from '../constants';
import { editWelcomeCaption } from '../helpers/edit-welcome-caption';
import { replyWithNewSubscription } from '../helpers/reply-new-subscription';

@Injectable()
@Scene(TELEGRAM_SCENE_PURCHASE)
export class PurchaseScene {
  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly pricingCatalog: PricingCatalogService,
    @InjectPinoLogger(PurchaseScene.name)
    private readonly log: PinoLogger,
  ) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: Context): Promise<void> {
    await editWelcomeCaption(
      ctx,
      MESSAGES.SELECT_DURATION,
      durationKeyboard(),
      this.log,
    );
  }

  @Action(ACTIONS.FREE_TEST)
  async onFree(@Ctx() ctx: Context): Promise<void> {
    await replyWithNewSubscription(ctx, 0, {
      usersService: this.usersService,
      subscriptionsService: this.subscriptionsService,
      pricingCatalog: this.pricingCatalog,
      log: this.log,
    });
  }

  @Action(ACTIONS.WEEK)
  async onWeek(@Ctx() ctx: Context): Promise<void> {
    await replyWithNewSubscription(ctx, 0.25, {
      usersService: this.usersService,
      subscriptionsService: this.subscriptionsService,
      pricingCatalog: this.pricingCatalog,
      log: this.log,
    });
  }

  @Action(ACTIONS.MONTH_1)
  async onM1(@Ctx() ctx: Context): Promise<void> {
    await replyWithNewSubscription(ctx, 1, {
      usersService: this.usersService,
      subscriptionsService: this.subscriptionsService,
      pricingCatalog: this.pricingCatalog,
      log: this.log,
    });
  }

  @Action(ACTIONS.MONTH_3)
  async onM3(@Ctx() ctx: Context): Promise<void> {
    await replyWithNewSubscription(ctx, 3, {
      usersService: this.usersService,
      subscriptionsService: this.subscriptionsService,
      pricingCatalog: this.pricingCatalog,
      log: this.log,
    });
  }

  @Action(ACTIONS.MONTH_6)
  async onM6(@Ctx() ctx: Context): Promise<void> {
    await replyWithNewSubscription(ctx, 6, {
      usersService: this.usersService,
      subscriptionsService: this.subscriptionsService,
      pricingCatalog: this.pricingCatalog,
      log: this.log,
    });
  }
}

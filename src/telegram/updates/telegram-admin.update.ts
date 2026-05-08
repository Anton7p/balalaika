import { Injectable } from '@nestjs/common';
import { Command, Ctx, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import { MESSAGES } from '../../common/content/messages';
import { AdminAccessService } from '../admin-access.service';
import { AdminStatusService } from '../admin-status.service';

@Update()
@Injectable()
export class TelegramAdminUpdate {
  constructor(
    private readonly adminAccess: AdminAccessService,
    private readonly adminStatus: AdminStatusService,
  ) {}

  @Command('admin')
  async onAdminStatus(@Ctx() ctx: Context): Promise<void> {
    if (ctx.from === undefined || !this.adminAccess.isAdmin(ctx.from.id)) {
      await ctx.reply(MESSAGES.ADMIN_FORBIDDEN);
      return;
    }

    const text = await this.adminStatus.buildStatusMessage();
    await ctx.reply(text);
  }
}

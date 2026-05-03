import { Injectable } from '@nestjs/common';
import type { User as TgUser } from '@telegraf/types';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertUserResult {
  readonly id: string;
  readonly telegramId: bigint;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromTelegram(from: TgUser): Promise<UpsertUserResult> {
    const row = await this.prisma.user.upsert({
      where: { telegramId: BigInt(from.id) },
      create: {
        telegramId: BigInt(from.id),
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
      },
      update: {
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
      },
      select: {
        id: true,
        telegramId: true,
      },
    });
    return {
      id: row.id,
      telegramId: row.telegramId,
    };
  }

  async findIdByTelegramId(telegramId: bigint): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}

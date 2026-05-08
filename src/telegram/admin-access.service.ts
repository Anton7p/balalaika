import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminAccessService {
  private readonly adminIds: Set<number>;

  constructor(private readonly config: ConfigService) {
    const csv = this.config.get<string>('TELEGRAM_ADMIN_IDS') ?? '';
    this.adminIds = new Set(
      csv
        .split(',')
        .map((raw) => raw.trim())
        .filter((raw) => raw.length > 0)
        .map((raw) => Number(raw))
        .filter((id) => Number.isSafeInteger(id)),
    );
  }

  isAdmin(telegramId: number): boolean {
    return this.adminIds.has(telegramId);
  }
}

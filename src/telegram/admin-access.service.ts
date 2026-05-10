import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminAccessService {
  private readonly adminIds: Set<number>;

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<string>('TELEGRAM_ADMIN_ID') ?? '';
    const trimmed = raw.trim();
    const id = Number(trimmed);
    this.adminIds = new Set(
      trimmed.length > 0 && Number.isSafeInteger(id) ? [id] : [],
    );
  }

  isAdmin(telegramId: number): boolean {
    return this.adminIds.has(telegramId);
  }
}

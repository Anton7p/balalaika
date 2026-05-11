import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export class EnvVars {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsString()
  @IsNotEmpty()
  TELEGRAM_BOT_TOKEN!: string;

  /** Полный URL прокси: socks5://127.0.0.1:10808 или http://127.0.0.1:10808 */
  @IsOptional()
  @IsString()
  TELEGRAM_PROXY_URL?: string;

  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(2592000)
  TELEGRAM_SESSION_TTL_SECONDS?: number;

  @IsOptional()
  @IsString()
  TELEGRAM_SESSION_KEY_PREFIX?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3600)
  TELEGRAM_RL_WINDOW_SECONDS?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  TELEGRAM_RL_MAX?: number;

  @IsOptional()
  @IsString()
  TELEGRAM_RL_KEY_PREFIX?: string;

  /** Один числовой User ID администратора бота (строкой из цифр). */
  @IsOptional()
  @IsString()
  TELEGRAM_ADMIN_ID?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST!: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  REDIS_PORT!: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  /** Hex 64 символа (32 байта) для AES-256-GCM */
  @IsString()
  @IsNotEmpty()
  ENCRYPTION_KEY!: string;

  @IsOptional()
  @IsString()
  LEGAL_FAQ_URL?: string;

  @IsOptional()
  @IsString()
  LEGAL_TERMS_URL?: string;

  @IsOptional()
  @IsString()
  LEGAL_PRIVACY_URL?: string;

  @IsOptional()
  @IsString()
  PLATFORM_GUIDE_IOS_URL?: string;

  @IsOptional()
  @IsString()
  PLATFORM_GUIDE_ANDROID_URL?: string;

  @IsOptional()
  @IsString()
  PLATFORM_GUIDE_WINDOWS_URL?: string;

  @IsOptional()
  @IsString()
  PLATFORM_GUIDE_MACOS_URL?: string;

  @IsOptional()
  @IsString()
  VPN_HEALTHCHECK_URL?: string;

  @IsString()
  @IsNotEmpty()
  VPN_PANEL_URL!: string;

  @IsString()
  @IsNotEmpty()
  VPN_ADMIN_USERNAME!: string;

  @IsString()
  @IsNotEmpty()
  VPN_ADMIN_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DOMAIN_NAME!: string;
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    whitelist: true,
    forbidUnknownValues: false,
  });
  if (errors.length > 0) {
    const msgs = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Ошибка конфигурации окружения: ${msgs}`);
  }
  return validated;
}

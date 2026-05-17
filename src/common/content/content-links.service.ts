import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LegalLink } from './legal-links';
import { LEGAL_LINK_DISPLAY_NAMES, type LegalLinkKey } from './legal-links';
import type { PlatformGuidesBundle, PlatformGuideKey } from './platform-guides';
import {
  LEGAL_SITE_PATHS,
  PLATFORM_GUIDE_SITE_PATHS,
} from './site-content-paths';

const LEGAL_URL_ENV: Record<LegalLinkKey, string> = {
  FAQ: 'LEGAL_FAQ_URL',
  TERMS: 'LEGAL_TERMS_URL',
  PRIVACY: 'LEGAL_PRIVACY_URL',
};

const PLATFORM_URL_ENV: Record<PlatformGuideKey, string> = {
  IOS: 'PLATFORM_GUIDE_IOS_URL',
  ANDROID: 'PLATFORM_GUIDE_ANDROID_URL',
  WINDOWS: 'PLATFORM_GUIDE_WINDOWS_URL',
  MACOS: 'PLATFORM_GUIDE_MACOS_URL',
};

/** Юридические и гайд-ссылки: env или пути из `site-content-paths.ts` на `DOMAIN_NAME`. */
@Injectable()
export class ContentLinksService {
  constructor(private readonly config: ConfigService) {}

  /** Origin без завершающего слэша: `https://hostname` */
  private siteOrigin(): string {
    const raw = this.config.get<string>('DOMAIN_NAME')?.trim() ?? '';
    const host = raw.replace(/^https?:\/\//i, '').split('/')[0]?.trim() ?? '';
    return host.length > 0 ? `https://${host}` : '';
  }

  private absoluteFromSitePath(path: string): string {
    const origin = this.siteOrigin();
    const p = path.startsWith('/') ? path : `/${path}`;
    return origin.length > 0 ? `${origin}${p}` : p;
  }

  getLegalLinks(): Record<LegalLinkKey, LegalLink> {
    const keys: LegalLinkKey[] = ['FAQ', 'TERMS', 'PRIVACY'];
    const result = {} as Record<LegalLinkKey, LegalLink>;
    for (const key of keys) {
      const raw = this.config.get<string>(LEGAL_URL_ENV[key]);
      const url =
        raw !== undefined && raw.length > 0
          ? raw
          : this.absoluteFromSitePath(LEGAL_SITE_PATHS[key]);
      result[key] = {
        name: LEGAL_LINK_DISPLAY_NAMES[key],
        url,
      };
    }
    return result;
  }

  private adminTelegramUserId(): string {
    const raw = this.config.get<string | number>('TELEGRAM_ADMIN_ID');
    if (raw === undefined || raw === null) {
      return '';
    }
    return String(raw).trim();
  }

  /**
   * URL для кнопки «Поддержка»: TELEGRAM_SUPPORT_URL или tg://user?id=TELEGRAM_ADMIN_ID.
   */
  resolveSupportContactUrl(): string | undefined {
    const explicit = this.config.get<string>('TELEGRAM_SUPPORT_URL')?.trim() ?? '';
    if (explicit.length > 0) {
      return explicit;
    }
    const adminId = this.adminTelegramUserId();
    if (/^\d+$/.test(adminId)) {
      return `tg://user?id=${adminId}`;
    }
    return undefined;
  }

  /** То же, что resolveSupportContactUrl, но для экрана условий (кнопка обязательна). */
  requireSupportContactUrl(): string {
    const url = this.resolveSupportContactUrl();
    if (url !== undefined && url.length > 0) {
      return url;
    }
    throw new Error(
      'Support contact is not configured: set TELEGRAM_SUPPORT_URL or TELEGRAM_ADMIN_ID',
    );
  }

  getPlatformGuides(): PlatformGuidesBundle {
    const keys: PlatformGuideKey[] = ['IOS', 'ANDROID', 'WINDOWS', 'MACOS'];
    const out = {} as PlatformGuidesBundle;
    for (const key of keys) {
      const raw = this.config.get<string>(PLATFORM_URL_ENV[key]);
      out[key] =
        raw !== undefined && raw.length > 0
          ? raw
          : this.absoluteFromSitePath(PLATFORM_GUIDE_SITE_PATHS[key]);
    }
    return out;
  }
}

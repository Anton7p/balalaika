import * as http from 'node:http';
import { URL } from 'node:url';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

/** Agent для исходящих HTTPS-запросов Telegraf к api.telegram.org через локальный прокси. */
export function createTelegramApiAgent(proxyUrl: string): http.Agent {
  const trimmed = proxyUrl.trim();
  const u = new URL(trimmed);
  if (u.protocol === 'socks5:' || u.protocol === 'socks4:') {
    return new SocksProxyAgent(trimmed);
  }
  if (u.protocol === 'http:' || u.protocol === 'https:') {
    return new HttpsProxyAgent(trimmed);
  }
  throw new Error(
    `TELEGRAM_PROXY_URL: неподдерживаемая схема "${u.protocol}" (ожидались socks5:, socks4:, http:, https:)`,
  );
}

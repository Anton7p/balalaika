export interface VpnClientCreateParams {
  readonly label: string;
  readonly planMonths: number;
  /** Макс. одновременных IP (поле limitIp клиента в 3x-ui / Xray). */
  readonly limitIp: number;
  /** Numeric Telegram user id для имени в панели; если нет — случайный анонимный префикс. */
  readonly telegramUserId?: bigint;
}

/** Ответ createClient: URI для пользователя (целевой формат — `vless://…`) + идентификаторы для продления через updateClient. */
export interface VpnClientCreated {
  readonly connectionUri: string;
  readonly panelClientUuid: string;
  readonly panelSubId: string;
  /** expiryTime в панели (epoch ms) — для expiresAt в БД без расхождения с Xray. */
  readonly panelExpiryEpochMs: number;
  /** Inbound на master, в который добавлен клиент (для продления и failover). */
  readonly panelInboundId: number;
}

export interface VpnClientExtendParams {
  readonly clientUuid: string;
  readonly panelSubId: string;
  /** Inbound, где уже лежит клиент (не «текущий приём новых»). */
  readonly panelInboundId: number;
  readonly planMonths: number;
  readonly limitIp: number;
  readonly telegramUserId?: bigint;
}

export interface VpnProvider {
  createClient(params: VpnClientCreateParams): Promise<VpnClientCreated>;

  /** Продлить срок клиента в inbound без addClient (3x-ui updateClient). */
  extendClientExpiry(
    params: VpnClientExtendParams,
  ): Promise<{
    connectionUri: string;
    panelExpiryEpochMs: number;
    panelInboundId: number;
  }>;

  deleteClient(externalId: string): Promise<void>;
  getStats(externalId: string): Promise<Record<string, unknown>>;
  /** Быстрая проверка доступности интеграции (для readiness). */
  probeIntegration(): Promise<boolean>;
}

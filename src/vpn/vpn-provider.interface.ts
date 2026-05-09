export interface VpnClientCreateParams {
  readonly label: string;
  readonly planMonths: number;
  /** Макс. одновременных IP (поле limitIp клиента в 3x-ui / Xray). */
  readonly limitIp: number;
  /** Numeric Telegram user id для имени в панели; если нет — случайный анонимный префикс. */
  readonly telegramUserId?: bigint;
}

export interface VpnProvider {
  createClient(
    params: VpnClientCreateParams,
  ): Promise<{ connectionUri: string }>;
  deleteClient(externalId: string): Promise<void>;
  getStats(externalId: string): Promise<Record<string, unknown>>;
  /** Быстрая проверка доступности интеграции (для readiness). */
  probeIntegration(): Promise<boolean>;
}

export interface VpnClientCreateParams {
  readonly label: string;
  readonly planMonths: number;
}

export interface VpnProvider {
  createClient(params: VpnClientCreateParams): Promise<{ connectionUri: string }>;
  deleteClient(externalId: string): Promise<void>;
  getStats(externalId: string): Promise<Record<string, unknown>>;
  /** Быстрая проверка доступности интеграции (для readiness). */
  probeIntegration(): Promise<boolean>;
}

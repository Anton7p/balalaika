export interface VpnNodeStatus {
  readonly name: string;
  readonly address: string;
  readonly status: string;
}

/** Контракт административных операций VPN-панели (для Telegram-админки и мониторинга). */
export interface VpnAdminProvider {
  listNodes(): Promise<readonly VpnNodeStatus[]>;
}

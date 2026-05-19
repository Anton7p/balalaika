import axios, { type AxiosInstance } from 'axios';

interface PanelMsg {
  success?: boolean;
  msg?: string;
}

export class WatchdogPanelSession {
  private cookieHeader = '';
  private loggedIn = false;

  constructor(
    private readonly origin: string,
    private readonly username: string,
    private readonly password: string,
    private readonly http: AxiosInstance,
    private readonly userAgent: string,
  ) {}

  reset(): void {
    this.cookieHeader = '';
    this.loggedIn = false;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': this.userAgent,
      Referer: `${this.origin}/panel/`,
      Origin: this.origin,
      ...(this.cookieHeader ? { Cookie: this.cookieHeader } : {}),
      ...extra,
    };
  }

  private absorbSetCookie(header?: string | string[]): void {
    if (!header) {
      return;
    }
    const rows = Array.isArray(header) ? header : [header];
    const map = new Map<string, string>();
    for (const part of this.cookieHeader.split(';')) {
      const t = part.trim();
      if (!t) {
        continue;
      }
      const eq = t.indexOf('=');
      if (eq > 0) {
        map.set(t.slice(0, eq).trim(), t.slice(eq + 1).trim());
      }
    }
    for (const row of rows) {
      const kv = row.split(';')[0]?.trim();
      if (!kv) {
        continue;
      }
      const eq = kv.indexOf('=');
      if (eq > 0) {
        map.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
      }
    }
    this.cookieHeader = [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private apiPath(suffix: string): string {
    const p = suffix.startsWith('/') ? suffix : `/${suffix}`;
    return `${this.origin}/panel${p}`;
  }

  private async csrf(): Promise<string> {
    const res = await this.http.get<{ obj?: string }>(
      `${this.origin}/panel/csrf-token`,
      { headers: this.headers(), validateStatus: (s) => s === 200 },
    );
    this.absorbSetCookie(res.headers['set-cookie']);
    const t = res.data.obj;
    if (!t) {
      throw new Error('csrf empty');
    }
    return String(t);
  }

  async getJson<T>(path: string): Promise<T> {
    await this.ensureLogin();
    const res = await this.http.get<T>(this.apiPath(path), {
      headers: this.headers(),
      validateStatus: (s) => s === 200,
    });
    return res.data;
  }

  async ensureLogin(): Promise<void> {
    if (this.loggedIn) {
      return;
    }
    const token = await this.csrf();
    const body = new URLSearchParams({
      username: this.username,
      password: this.password,
    });
    const res = await this.http.post<PanelMsg>(
      `${this.origin}/panel/login`,
      body.toString(),
      {
        headers: {
          ...this.headers(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-Token': token,
        },
        validateStatus: (s) => s === 200,
      },
    );
    this.absorbSetCookie(res.headers['set-cookie']);
    if (!res.data.success) {
      throw new Error(`login failed: ${res.data.msg ?? 'unknown'}`);
    }
    this.loggedIn = true;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    await this.ensureLogin();
    const token = await this.csrf();
    const res = await this.http.post<T>(this.apiPath(path), body, {
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      validateStatus: (s) => s === 200,
    });
    return res.data;
  }

  async clientCount(inboundId: number): Promise<number> {
    return (await this.listClientEmails(inboundId)).length;
  }

  async clientCounts(
    inboundIds: readonly number[],
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    for (const inboundId of inboundIds) {
      map.set(inboundId, await this.clientCount(inboundId));
    }
    return map;
  }

  private async listInboundClients(
    inboundId: number,
  ): Promise<readonly { id: string; email: string }[]> {
    await this.ensureLogin();
    const res = await this.http.get<{ obj?: { settings?: string } }>(
      this.apiPath(`/panel/api/inbounds/get/${inboundId}`),
      { headers: this.headers(), validateStatus: (s) => s === 200 },
    );
    const settingsRaw = res.data.obj?.settings;
    if (typeof settingsRaw !== 'string') {
      return [];
    }
    const settings = JSON.parse(settingsRaw) as { clients?: unknown };
    if (!Array.isArray(settings.clients)) {
      return [];
    }
    const out: { id: string; email: string }[] = [];
    for (const c of settings.clients) {
      if (typeof c !== 'object' || c === null) {
        continue;
      }
      const id = String((c as { id?: string }).id ?? '').trim();
      const email = String((c as { email?: string }).email ?? '').trim();
      if (id.length > 0 && email.length > 0) {
        out.push({ id, email });
      }
    }
    return out;
  }

  async listClientEmails(inboundId: number): Promise<string[]> {
    const clients = await this.listInboundClients(inboundId);
    return clients.map((c) => c.email);
  }

  async deleteClientByEmail(inboundId: number, email: string): Promise<void> {
    const enc = encodeURIComponent(email);
    const data = await this.postJson<PanelMsg>(
      `/panel/api/inbounds/${inboundId}/delClientByEmail/${enc}`,
      {},
    );
    if (!data.success) {
      throw new Error(
        `delClientByEmail ${email}: ${data.msg ?? 'unknown'}`,
      );
    }
  }

  /** Удаляет inbound на master (клиенты и статистика — в БД панели). */
  async deleteInbound(inboundId: number): Promise<void> {
    const data = await this.postJson<PanelMsg>(
      `/panel/api/inbounds/del/${inboundId}`,
      {},
    );
    if (!data.success) {
      throw new Error(`deleteInbound ${inboundId}: ${data.msg ?? 'unknown'}`);
    }
  }

  /** Убирает ноду из раздела Nodes на master (inbound’ы сами не удаляются). */
  async deleteNode(panelNodeId: number): Promise<void> {
    const data = await this.postJson<PanelMsg>(
      `/panel/api/nodes/del/${panelNodeId}`,
      {},
    );
    if (!data.success) {
      throw new Error(`deleteNode ${panelNodeId}: ${data.msg ?? 'unknown'}`);
    }
  }

  async copyClients(
    targetInboundId: number,
    sourceInboundId: number,
    emails: string[],
  ): Promise<void> {
    const data = await this.postJson<PanelMsg>(
      `/panel/api/inbounds/${targetInboundId}/copyClients`,
      {
        sourceInboundId,
        clientEmails: emails,
        flow: 'xtls-rprx-vision',
      },
    );
    if (!data.success) {
      throw new Error(`copyClients: ${data.msg ?? 'unknown'}`);
    }
  }

  async setInboundEnabled(inboundId: number, enable: boolean): Promise<void> {
    const data = await this.postJson<PanelMsg>(
      `/panel/api/inbounds/setEnable/${inboundId}`,
      { enable },
    );
    if (!data.success) {
      throw new Error(`setEnable: ${data.msg ?? 'unknown'}`);
    }
  }

  async probeNode(panelNodeId: number): Promise<boolean> {
    try {
      const data = await this.postJson<PanelMsg>(
        `/panel/api/nodes/probe/${panelNodeId}`,
        {},
      );
      return data.success === true;
    } catch {
      return false;
    }
  }
}

export function createPanelSession(
  origin: string,
  username: string,
  password: string,
  userAgent: string,
): WatchdogPanelSession {
  return new WatchdogPanelSession(
    origin,
    username,
    password,
    axios.create({ timeout: 25000 }),
    userAgent,
  );
}

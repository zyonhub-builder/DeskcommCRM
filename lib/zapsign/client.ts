const ZAPSIGN_BASE_URL = "https://api.zapsign.com.br";
const ZAPSIGN_SANDBOX_BASE_URL = "https://sandbox.api.zapsign.com.br";

export type ZapSignClientOptions = {
  apiToken: string;
  baseUrl?: string;
  sandbox?: boolean;
  fetchImpl?: typeof fetch;
};

export type ZapSignDocumentSummary = {
  token?: string;
  open_id?: string | number;
  status?: string;
  name?: string;
  external_id?: string | null;
  created_at?: string;
  last_update_at?: string;
  signers?: unknown[];
  original_file?: string | null;
  signed_file?: string | null;
  [key: string]: unknown;
};

export class ZapSignApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ZapSignApiError";
    this.status = status;
    this.body = body;
  }
}

function normalizarBaseUrl(input: { baseUrl?: string; sandbox?: boolean }): string {
  const base = input.baseUrl?.trim() || (input.sandbox ? ZAPSIGN_SANDBOX_BASE_URL : ZAPSIGN_BASE_URL);
  return base.replace(/\/+$/, "");
}

function montarPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class ZapSignClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ZapSignClientOptions) {
    this.apiToken = options.apiToken;
    this.baseUrl = normalizarBaseUrl(options);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.apiToken}`);
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await this.fetchImpl(`${this.baseUrl}${montarPath(path)}`, {
      ...init,
      headers,
    });
    const body = await parseResponse(res);
    if (!res.ok) {
      const detalhe =
        typeof body === "string"
          ? body
          : body && typeof body === "object" && "detail" in body
            ? String((body as { detail?: unknown }).detail)
            : `HTTP ${res.status}`;
      throw new ZapSignApiError(`zapsign_api_error: ${detalhe}`, res.status, body);
    }
    return body as T;
  }

  async testToken(): Promise<void> {
    await this.listDocuments({ page: 1 });
  }

  async listDocuments(input: { page?: number; status?: string } = {}): Promise<ZapSignDocumentSummary[]> {
    const params = new URLSearchParams();
    params.set("page", String(input.page ?? 1));
    if (input.status) params.set("status", input.status);
    return this.request<ZapSignDocumentSummary[]>(`/api/v1/docs/?${params.toString()}`);
  }

  async getDocument(token: string): Promise<ZapSignDocumentSummary> {
    return this.request<ZapSignDocumentSummary>(`/api/v1/docs/${encodeURIComponent(token)}/`);
  }

  async createDocument(body: Record<string, unknown>): Promise<ZapSignDocumentSummary> {
    return this.request<ZapSignDocumentSummary>("/api/v1/docs/", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async createDocumentFromTemplate(body: Record<string, unknown>): Promise<ZapSignDocumentSummary> {
    return this.request<ZapSignDocumentSummary>("/api/v1/models/create-doc/", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}

export function zapsignBaseUrl(input: { baseUrl?: string; sandbox?: boolean }): string {
  return normalizarBaseUrl(input);
}

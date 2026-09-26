import { describe, expect, it } from "vitest";

import { aplicarWebhookZapsign, type IntegrationRow } from "@/lib/zapsign/service";

const ORG = "11111111-1111-4111-8111-111111111111";
const INTEGRATION = "22222222-2222-4222-8222-222222222222";
const DOC = "33333333-3333-4333-8333-333333333333";
const LEAD = "44444444-4444-4444-8444-444444444444";
const CONTACT = "55555555-5555-4555-8555-555555555555";

const integration = {
  id: INTEGRATION,
  organization_id: ORG,
  oauth_access_token_encrypted: null,
  webhook_secret_encrypted: null,
  webhook_path_token: "token",
  status: "connected",
  status_reason: null,
  store_metadata: null,
  last_health_check_at: null,
  updated_at: null,
} satisfies IntegrationRow;

type Row = {
  id: string;
  organization_id: string;
  external_token: string;
  status: string;
  signed_at: string | null;
  lead_id: string | null;
  contact_id: string | null;
};

class Query {
  private filters: Record<string, unknown> = {};
  private patch: Record<string, unknown> | null = null;

  constructor(private db: FakeDb) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters[column] = value;
    return this;
  }

  upsert(patch: Record<string, unknown>): this {
    this.patch = patch;
    return this;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.db.find(this.filters), error: null };
  }

  async single(): Promise<{ data: Row; error: null }> {
    if (!this.patch) throw new Error("upsert não chamado");
    return { data: this.db.upsert(this.patch), error: null };
  }
}

class FakeDb {
  rows = new Map<string, Row>();

  from(table: string): Query {
    if (table !== "zapsign_documents") throw new Error(`tabela inesperada: ${table}`);
    return new Query(this);
  }

  find(filters: Record<string, unknown>): Row | null {
    const key = String(filters.external_token ?? "");
    const row = this.rows.get(key);
    if (!row || row.organization_id !== filters.organization_id) return null;
    return { ...row };
  }

  upsert(patch: Record<string, unknown>): Row {
    const key = String(patch.external_token);
    const anterior = this.rows.get(key);
    const row = {
      id: anterior?.id ?? DOC,
      organization_id: String(patch.organization_id),
      external_token: key,
      status: String(patch.status),
      signed_at:
        typeof patch.signed_at === "string" ? patch.signed_at : (anterior?.signed_at ?? null),
      lead_id: anterior?.lead_id ?? null,
      contact_id: anterior?.contact_id ?? null,
    };
    this.rows.set(key, row);
    return { ...row };
  }
}

describe("webhook ZapSign assinado", () => {
  it("marca signed_now só quando o documento transita para assinado", async () => {
    const db = new FakeDb();
    db.rows.set("doc-token", {
      id: DOC,
      organization_id: ORG,
      external_token: "doc-token",
      status: "pending",
      signed_at: null,
      lead_id: LEAD,
      contact_id: CONTACT,
    });

    const primeiro = await aplicarWebhookZapsign(db as never, {
      integration,
      eventType: "doc_signed",
      payload: { token: "doc-token", name: "Contrato" },
    });

    expect(primeiro).toMatchObject({
      ok: true,
      data: {
        document_id: DOC,
        document_token: "doc-token",
        lead_id: LEAD,
        contact_id: CONTACT,
        status: "signed",
        signed_now: true,
      },
    });

    const segundo = await aplicarWebhookZapsign(db as never, {
      integration,
      eventType: "doc_signed",
      payload: { token: "doc-token", name: "Contrato" },
    });

    expect(segundo).toMatchObject({
      ok: true,
      data: { document_id: DOC, signed_now: false },
    });
  });
});

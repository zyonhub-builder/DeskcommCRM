import { afterEach, describe, expect, it, vi } from "vitest";

import { criarDocumentoZapsign } from "@/lib/zapsign/service";

const ORG = "11111111-1111-4111-8111-111111111111";
const INTEGRATION = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";
const CONTACT = "44444444-4444-4444-8444-444444444444";

let ultimoUpsert: Record<string, unknown> | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

class Query {
  private filters: Record<string, unknown> = {};
  private patch: Record<string, unknown> | null = null;

  constructor(private readonly table: string) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters[column] = value;
    return this;
  }

  upsert(patch: Record<string, unknown>): this {
    this.patch = patch;
    ultimoUpsert = patch;
    return this;
  }

  async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: null }> {
    if (this.table === "tenant_integrations") {
      return {
        data:
          this.filters.organization_id === ORG && this.filters.provider === "zapsign"
            ? {
                id: INTEGRATION,
                organization_id: ORG,
                oauth_access_token_encrypted: "token-enc",
                webhook_secret_encrypted: "secret-enc",
                webhook_path_token: "webhook-token",
                status: "healthy",
                status_reason: null,
                store_metadata: { sandbox: true, base_url: "https://zap.local" },
                last_health_check_at: null,
                updated_at: null,
              }
            : null,
        error: null,
      };
    }
    if (this.table === "crm_leads") {
      return {
        data:
          this.filters.organization_id === ORG && this.filters.id === LEAD
            ? { id: LEAD, contact_id: CONTACT }
            : null,
        error: null,
      };
    }
    if (this.table === "contacts") {
      return {
        data:
          this.filters.organization_id === ORG && this.filters.id === CONTACT
            ? { id: CONTACT }
            : null,
        error: null,
      };
    }
    throw new Error(`maybeSingle inesperado em ${this.table}`);
  }

  async single(): Promise<{ data: Record<string, unknown>; error: null }> {
    if (this.table !== "zapsign_documents" || this.patch === null) {
      throw new Error(`single inesperado em ${this.table}`);
    }
    return {
      data: {
        id: "doc-local",
        created_at: "2026-09-26T21:00:00.000Z",
        updated_at: "2026-09-26T21:00:00.000Z",
        ...this.patch,
      },
      error: null,
    };
  }
}

class FakeDb {
  from(table: string): Query {
    return new Query(table);
  }

  async rpc(name: string, args: Record<string, unknown>): Promise<{ data: string; error: null }> {
    if (name !== "fn_decrypt_oauth") throw new Error(`rpc inesperado: ${name}`);
    return { data: args.ciphertext === "token-enc" ? "api-token" : "webhook-secret", error: null };
  }
}

describe("criarDocumentoZapsign", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    ultimoUpsert = null;
  });

  it("traduz o primeiro signatário para os campos exigidos pelo endpoint de modelo", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({
        token: "doc-token",
        open_id: 10,
        name: "Contrato de teste",
        status: "pending",
        signers: [{ name: "Ana Cliente" }],
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const resultado = await criarDocumentoZapsign(new FakeDb() as never, {
      organizationId: ORG,
      actorKind: "ai",
      actorRef: "run-1",
      source: "mcp",
      modo: "modelo",
      nome: "Contrato de teste",
      templateId: "tpl-1",
      templateData: { "{{Nome}}": "Ana Cliente" },
      signers: [
        {
          name: "Ana Cliente",
          email: "ana@example.test",
          send_automatic_email: true,
        },
      ],
      leadId: LEAD,
      contactId: CONTACT,
    });

    expect(resultado.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://zap.local/api/v1/models/create-doc/",
      expect.objectContaining({ method: "POST" }),
    );
    const payload = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(payload).toMatchObject({
      name: "Contrato de teste",
      template_id: "tpl-1",
      signer_name: "Ana Cliente",
      signer_email: "ana@example.test",
      send_automatic_email: true,
      data: [{ de: "{{Nome}}", para: "Ana Cliente" }],
    });
    expect(payload.signers).toBeUndefined();
  });

  it("normaliza external_id vazio e expõe link de assinatura para o agente enviar no chat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        json({
          token: "doc-token",
          open_id: 10,
          external_id: "",
          name: "Contrato de teste",
          status: "pending",
          signers: [{ token: "signer-token", name: "Ana Cliente", status: "new" }],
        }),
      ),
    );

    const resultado = await criarDocumentoZapsign(new FakeDb() as never, {
      organizationId: ORG,
      actorKind: "ai",
      actorRef: "run-1",
      source: "mcp",
      modo: "modelo",
      nome: "Contrato de teste",
      templateId: "tpl-1",
      templateData: { "{{Nome}}": "Ana Cliente" },
      signers: [{ name: "Ana Cliente" }],
      leadId: LEAD,
      contactId: CONTACT,
    });

    expect(resultado.ok).toBe(true);
    expect(ultimoUpsert?.external_id).toBeNull();
    if (!resultado.ok) return;
    expect(resultado.data.documento.links_assinatura).toEqual([
      {
        url: "https://app.zapsign.com.br/verificar/signer-token",
        signer_token: "signer-token",
        status: "new",
        nome: "Ana Cliente",
      },
    ]);
  });
});

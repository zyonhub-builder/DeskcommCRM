import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/v1/integrations/zapsign/documents/route";
import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { criarDocumentoZapsign, listarDocumentosZapsign } from "@/lib/zapsign/service";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: vi.fn(async () => true) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ tag: "admin-db" })) }));
vi.mock("@/lib/zapsign/service", () => ({
  criarDocumentoZapsign: vi.fn(),
  listarDocumentosZapsign: vi.fn(),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/v1/integrations/zapsign/documents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function corpoValido(overrides: Record<string, unknown> = {}) {
  return {
    nome: "Contrato de teste",
    tipo_arquivo: "pdf",
    url_documento: "https://arquivos.exemplo/contrato.pdf",
    signatario_nome: "Maria Cliente",
    signatario_email: "maria@example.com",
    enviar_email: true,
    ...overrides,
  };
}

describe("POST /api/v1/integrations/zapsign/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSupportWrite).mockResolvedValue(null);
    vi.mocked(moduloLigado).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as Awaited<
      ReturnType<typeof checkRateLimit>
    >);
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      user: { id: USER_ID, email: "ana@example.com", idioma: "pt-BR" },
      org: { orgId: ORG, role: "admin" },
    } as unknown as Awaited<ReturnType<typeof requireRole>>);
    vi.mocked(criarDocumentoZapsign).mockResolvedValue({
      ok: true,
      data: {
        documento: {
          id: "doc-local-1",
          token: "token-zapsign",
          name: "Contrato de teste",
          signers: [{ name: "Maria Cliente", email: "maria@example.com" }],
        },
        resposta_zapsign: {},
      },
    } as unknown as Awaited<ReturnType<typeof criarDocumentoZapsign>>);
    vi.mocked(listarDocumentosZapsign).mockResolvedValue({
      documentos: [
        {
          id: "doc-local-1",
          token: "token-zapsign",
          name: "Contrato de teste",
          status: "signed",
          signers: [{ name: "Maria Cliente", email: "maria@example.com" }],
          provider_payload: { raw: "não deve sair" },
        },
      ],
    } as unknown as Awaited<ReturnType<typeof listarDocumentosZapsign>>);
  });

  it("cria documento na organização autenticada e não aceita org vinda do body", async () => {
    const res = await POST(
      req(corpoValido({ organization_id: "99999999-9999-4999-8999-999999999999" })),
    );

    expect(res.status).toBe(422);
    expect(criarDocumentoZapsign).not.toHaveBeenCalled();

    const ok = await POST(req(corpoValido()));
    expect(ok.status).toBe(201);
    expect(criarDocumentoZapsign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG,
        actorKind: "user",
        actorRef: USER_ID,
        source: "api",
        modo: "arquivo",
        urlPdf: "https://arquivos.exemplo/contrato.pdf",
      }),
    );
  });

  it("registra auditoria sem nome, e-mail ou URL do documento", async () => {
    await POST(req(corpoValido()));

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "zapsign.document_created",
        organizationId: ORG,
        resourceType: "zapsign_document",
      }),
    );
    const auditSerializado = JSON.stringify(vi.mocked(audit).mock.calls);
    expect(auditSerializado).not.toContain("Maria Cliente");
    expect(auditSerializado).not.toContain("maria@example.com");
    expect(auditSerializado).not.toContain("arquivos.exemplo");
  });

  it("lista documentos sem expor signatários nem payload do provedor", async () => {
    const res = await GET(
      new NextRequest(
        "http://localhost/api/v1/integrations/zapsign/documents?contact_id=33333333-3333-4333-8333-333333333333&limite=5",
      ),
    );

    expect(res.status).toBe(200);
    expect(listarDocumentosZapsign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG,
        contactId: "33333333-3333-4333-8333-333333333333",
        limite: 5,
      }),
    );
    const body = await res.json();
    expect(body.data.documentos[0]).toMatchObject({
      id: "doc-local-1",
      token: "token-zapsign",
      name: "Contrato de teste",
      status: "signed",
    });
    const serializado = JSON.stringify(body);
    expect(serializado).not.toContain("Maria Cliente");
    expect(serializado).not.toContain("maria@example.com");
    expect(serializado).not.toContain("provider_payload");
  });

  it("some quando o módulo da instalação está desligado", async () => {
    vi.mocked(moduloLigado).mockResolvedValue(false);

    const res = await POST(req(corpoValido()));

    expect(res.status).toBe(404);
    expect(criarDocumentoZapsign).not.toHaveBeenCalled();
  });

  it("devolve o gate canônico quando o usuário não é admin", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden_role", "Papel insuficiente.", 403),
    } as unknown as Awaited<ReturnType<typeof requireRole>>);

    const res = await POST(req(corpoValido()));

    expect(res.status).toBe(403);
    expect(criarDocumentoZapsign).not.toHaveBeenCalled();
  });
});

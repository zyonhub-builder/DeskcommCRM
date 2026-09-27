import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/v1/integrations/zapsign/templates/route";
import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { listarModelosDocumentoZapsign, salvarModeloDocumentoZapsign } from "@/lib/zapsign/service";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: vi.fn(async () => true) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ tag: "admin-db" })) }));
vi.mock("@/lib/zapsign/service", () => ({
  listarModelosDocumentoZapsign: vi.fn(),
  salvarModeloDocumentoZapsign: vi.fn(),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/v1/integrations/zapsign/templates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function corpoValido(overrides: Record<string, unknown> = {}) {
  return {
    template_key: "previdenciario",
    nome: "Contrato Previdenciário",
    zapsign_template_id: "tpl-previdenciario",
    required_fields: ["{{Nome}}", "{{CPF}}"],
    template_data_defaults: { "{{Escritorio}}": "Talismã Advocacia" },
    is_active: true,
    is_default: true,
    default_for_agent: false,
    ...overrides,
  };
}

describe("/api/v1/integrations/zapsign/templates", () => {
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
    vi.mocked(listarModelosDocumentoZapsign).mockResolvedValue({
      modelos: [
        {
          id: "modelo-1",
          template_key: "previdenciario",
          name: "Contrato Previdenciário",
          description: null,
          zapsign_template_id: "tpl-previdenciario",
          required_fields: ["{{Nome}}"],
          template_data_defaults: {},
          agent_id: null,
          is_active: true,
          is_default: true,
          default_for_agent: false,
          created_at: "2026-09-27T09:00:00.000Z",
          updated_at: "2026-09-27T09:00:00.000Z",
        },
      ],
    } as Awaited<ReturnType<typeof listarModelosDocumentoZapsign>>);
    vi.mocked(salvarModeloDocumentoZapsign).mockResolvedValue({
      ok: true,
      data: {
        id: "modelo-1",
        template_key: "previdenciario",
        name: "Contrato Previdenciário",
        description: null,
        zapsign_template_id: "tpl-previdenciario",
        required_fields: ["{{Nome}}", "{{CPF}}"],
        template_data_defaults: { "{{Escritorio}}": "Talismã Advocacia" },
        agent_id: null,
        is_active: true,
        is_default: true,
        default_for_agent: false,
        created_at: "2026-09-27T09:00:00.000Z",
        updated_at: "2026-09-27T09:00:00.000Z",
      },
    } as Awaited<ReturnType<typeof salvarModeloDocumentoZapsign>>);
  });

  it("lista modelos da organização autenticada", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(listarModelosDocumentoZapsign).toHaveBeenCalledWith(expect.anything(), ORG);
  });

  it("salva modelo na organização autenticada e ignora organization_id do body", async () => {
    const res = await POST(
      req(corpoValido({ organization_id: "99999999-9999-4999-8999-999999999999" })),
    );

    expect(res.status).toBe(422);
    expect(salvarModeloDocumentoZapsign).not.toHaveBeenCalled();

    const ok = await POST(req(corpoValido()));
    expect(ok.status).toBe(201);
    expect(salvarModeloDocumentoZapsign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG,
        templateKey: "previdenciario",
        zapsignTemplateId: "tpl-previdenciario",
      }),
    );
  });

  it("recusa usuário sem papel de admin", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden_role", "Papel insuficiente.", 403),
    } as unknown as Awaited<ReturnType<typeof requireRole>>);

    const res = await POST(req(corpoValido()));

    expect(res.status).toBe(403);
    expect(salvarModeloDocumentoZapsign).not.toHaveBeenCalled();
  });

  it("audita sem gravar o id bruto do modelo da ZapSign", async () => {
    await POST(req(corpoValido()));

    const auditSerializado = JSON.stringify(vi.mocked(audit).mock.calls);
    expect(auditSerializado).toContain("zapsign.template_created");
    expect(auditSerializado).not.toContain("tpl-previdenciario");
  });
});

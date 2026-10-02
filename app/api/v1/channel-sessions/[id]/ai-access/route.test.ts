import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { loadAuthUser } from "@/lib/auth/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { GET, PATCH } from "./route";

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
const org = "11111111-1111-4111-8111-111111111111";
const canal = "22222222-2222-4222-8222-222222222222";
const telefone = "+5511999998888";
const filters: Record<string, unknown> = {};
const orgFilters: Record<string, unknown> = {};
const credFilters: Record<string, unknown> = {};
const rpc = vi.fn();
const row = {
  id: canal,
  organization_id: org,
  archived_at: null,
  metadata: {
    ai_gate: "allowlist",
    ai_gate_mode: "pre_go_live",
    ai_test_phone_numbers: [telefone],
    segredo_do_transporte: "nao-expor",
  },
};
let orgSettings: Record<string, unknown> = {};
let orgUpdate: Record<string, unknown> | null = null;
const context = (id = canal) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown = {}) =>
  new NextRequest("http://localhost/api/v1/channel-sessions/" + canal + "/ai-access", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAuthUser).mockResolvedValue(null);
  for (const k of Object.keys(filters)) delete filters[k];
  for (const k of Object.keys(orgFilters)) delete orgFilters[k];
  for (const k of Object.keys(credFilters)) delete credFilters[k];
  orgUpdate = null;
  orgSettings = {
    campanhas_whatsapp: [
      {
        id: "prev",
        match: { tipo: "starts_with", valor: "Quero benefício previdenciário" },
        channel_session_id: canal,
      },
    ],
  };
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: org },
    org: { orgId: org, role: "admin" },
  } as Awaited<ReturnType<typeof requireRole>>);
  const builder = (tabela: string) => {
    const alvo =
      tabela === "organizations"
        ? orgFilters
        : tabela === "ai_provider_credentials" || tabela === "ai_provider_credentials_safe"
          ? credFilters
          : filters;
    const query = {
      select: () => query,
      update: (payload: Record<string, unknown>) => {
        orgUpdate = payload;
        return query;
      },
      order: () => query,
      eq: (k: string, v: unknown) => {
        alvo[k] = v;
        return query;
      },
      is: (k: string, v: unknown) => {
        alvo[k] = v;
        return query;
      },
      maybeSingle: async () => {
        if (tabela === "organizations") {
          return {
            data: orgFilters.id === org ? { id: org, settings: orgSettings } : null,
            error: null,
          };
        }
        return {
          data: Object.entries(filters).every(([k, v]) => row[k as keyof typeof row] === v)
            ? row
            : null,
          error: null,
        };
      },
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return query;
  };
  rpc.mockResolvedValue({ data: 1, error: null });
  vi.mocked(createAdminClient).mockReturnValue({ from: builder, rpc } as unknown as ReturnType<
    typeof createAdminClient
  >);
});

describe("configuração de acesso da IA", () => {
  it("exige admin tanto para ler quanto para escrever e não consulta DB se negado", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "Acesso negado.", 403),
    });
    expect((await GET(req(), context())).status).toBe(403);
    expect((await PATCH(req(), context())).status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith(
      "admin",
      expect.objectContaining({ allowPlatformAdmin: true }),
    );
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("suporte readonly nega a mutação antes de service role e auditoria", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue({
      id: org,
      is_platform_admin: true,
      support: { organization_id: org, status: "active", access_mode: "support_readonly" },
    } as Awaited<ReturnType<typeof loadAuthUser>>);
    const response = await PATCH(req({ mode: "open", test_phone_numbers: [] }), context());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
    expect(requireRole).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it("retorna somente modo e telefones, com escopo de organização e canal ativo", async () => {
    const response = await GET(req(), context());
    expect((await response.json()).data).toEqual({
      mode: "pre_go_live",
      test_phone_numbers: [telefone],
      campaign_phrases: ["Quero benefício previdenciário"],
      voice: {
        mode: "off",
        provider: "elevenlabs",
        credential_id: null,
        voice_id: "",
        voice_label: "",
        voice_source: "library",
        cloned_voice_consent: false,
        speaker_name: "",
        updated_at: null,
      },
      voice_credentials: [],
      elevenlabs_credentials: [],
    });
    expect(filters).toEqual({ organization_id: org, id: canal, archived_at: null });
    expect(orgFilters).toEqual({ id: org });
    expect((await GET(req(), context(org))).status).toBe(404);
  });
  it("normaliza a lista, ignora organização do body e audita sem telefone", async () => {
    const response = await PATCH(
      req({
        mode: "pre_go_live",
        test_phone_numbers: ["+55 (11) 99999-8888", telefone],
        campaign_phrases: ["Quero BPC"],
        organization_id: canal,
      }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fn_configurar_pre_go_live_canal", {
      p_org: org,
      p_canal: canal,
      p_modo: "pre_go_live",
      p_numeros: [telefone],
      p_frases_campanha: ["Quero BPC"],
    });
    expect(orgUpdate).toBeNull();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "channel.ai_access_updated",
        metadata: { mode: "pre_go_live", test_phone_numbers_count: 1, campaign_phrases_count: 1 },
      }),
    );
    expect(JSON.stringify(vi.mocked(audit).mock.calls)).not.toContain(telefone);
  });
  it("aceita o modo restrito por campanhas/origem", async () => {
    const response = await PATCH(
      req({ mode: "allowlist", test_phone_numbers: [], campaign_phrases: ["Quero aposentadoria"] }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fn_configurar_pre_go_live_canal", {
      p_org: org,
      p_canal: canal,
      p_modo: "allowlist",
      p_numeros: [],
      p_frases_campanha: ["Quero aposentadoria"],
    });
  });
  it("recusa lista ou modo inválido sem alteração", async () => {
    for (const body of [
      { mode: "open" },
      { mode: "invalido", test_phone_numbers: [], campaign_phrases: [] },
      { mode: "open", test_phone_numbers: ["abc5511999998888"], campaign_phrases: [] },
    ]) {
      expect((await PATCH(req(body), context())).status).toBe(422);
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(orgUpdate).toBeNull();
  });
  it("não anuncia sucesso nem audita falha de banco ou canal ausente", async () => {
    rpc.mockResolvedValueOnce({ data: 0, error: null });
    expect((await PATCH(req({ mode: "open", test_phone_numbers: [] }), context())).status).toBe(
      404,
    );
    rpc.mockResolvedValueOnce({ data: null, error: { message: "rpc ausente" } });
    expect((await PATCH(req({ mode: "open", test_phone_numbers: [] }), context())).status).toBe(
      500,
    );
    expect(orgUpdate).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });
});

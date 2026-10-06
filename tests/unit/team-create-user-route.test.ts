/**
 * POST /api/v1/team/create-user — criação direta de membro com senha inicial.
 *
 * A feature existe para instalações self-host em que o admin prefere entregar
 * e-mail/senha fora do fluxo de convite. O teste guarda as três cercas que
 * importam: organização vem da sessão, senha não volta na resposta, e falha ao
 * gravar o vínculo apaga a conta recém-criada para não deixar usuário órfão.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";

const requireRole = vi.hoisted(() => vi.fn());
const requireSupportWrite = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn(async () => undefined));
const createAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/require-role", () => ({ requireRole }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite }));
vi.mock("@/lib/audit", () => ({
  audit,
  isServiceRoleConfigured: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

function req(body: unknown) {
  return new NextRequest("http://localhost/api/v1/team/create-user", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function authOk() {
  requireSupportWrite.mockResolvedValue(null);
  requireRole.mockResolvedValue({
    ok: true,
    user: {
      id: ADMIN_ID,
      email: "admin@example.test",
      full_name: "Admin",
      idioma: "pt-BR",
      is_platform_admin: false,
      organizations: [],
    },
    org: { orgId: ORG_ID, name: "Org", role: "admin" },
  });
}

function adminStub(options?: {
  activeMemberEmail?: string;
  createError?: { message: string };
  membershipError?: { message: string };
}) {
  const createUser = vi.fn(async () =>
    options?.createError
      ? { data: { user: null }, error: options.createError }
      : { data: { user: { id: USER_ID, email: "maria@example.test" } }, error: null },
  );
  const deleteUser = vi.fn(async () => ({ error: null }));
  const getUserById = vi.fn(async () => ({
    data: { user: { email: options?.activeMemberEmail ?? "outra@example.test" } },
    error: null,
  }));
  const rpc = vi.fn(async (_fn: string, _payload: Record<string, unknown>) =>
    options?.membershipError
      ? { data: null, error: options.membershipError }
      : { data: { id: MEMBERSHIP_ID, changed: true }, error: null },
  );
  const from = vi.fn((_table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        is: vi.fn(async () => ({
          data: [{ user_id: "existing-user" }],
          error: null,
        })),
      })),
    })),
  }));

  const admin = {
    auth: { admin: { createUser, deleteUser, getUserById } },
    from,
    rpc,
  };
  createAdminClient.mockReturnValue(admin);
  return { admin, createUser, deleteUser, getUserById, rpc, from };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  authOk();
});

describe("POST /api/v1/team/create-user", () => {
  it("cria a conta confirmada, aceita o vínculo na org ativa e não devolve a senha", async () => {
    const h = adminStub();
    const { POST } = await import("@/app/api/v1/team/create-user/route");

    const res = await POST(
      req({
        email: " Maria@Example.Test ",
        full_name: "Maria Silva",
        password: "SenhaForte!2026",
        role: "manager",
        interface_settings: { preset: "completa" },
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { email: string; user_id: string; membership_id: string; password?: string };
    };
    expect(body.data).toMatchObject({
      email: "maria@example.test",
      user_id: USER_ID,
      membership_id: MEMBERSHIP_ID,
    });
    expect(body.data.password).toBeUndefined();
    expect(h.createUser).toHaveBeenCalledWith({
      email: "maria@example.test",
      password: "SenhaForte!2026",
      email_confirm: true,
      user_metadata: { full_name: "Maria Silva" },
    });
    expect(h.rpc).toHaveBeenCalledWith(
      "fn_accept_team_invite",
      expect.objectContaining({
        p_user: USER_ID,
        p_org: ORG_ID,
        p_role: "manager",
        p_invited_by: ADMIN_ID,
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "member.created_by_admin",
        actorUserId: ADMIN_ID,
        organizationId: ORG_ID,
        resourceId: MEMBERSHIP_ID,
      }),
    );
  });

  it("não chama a Admin API quando o e-mail já é membro ativo da organização", async () => {
    const h = adminStub({ activeMemberEmail: "maria@example.test" });
    const { POST } = await import("@/app/api/v1/team/create-user/route");

    const res = await POST(
      req({
        email: "maria@example.test",
        password: "SenhaForte!2026",
        role: "agent",
        interface_settings: { preset: "completa" },
      }),
    );

    expect(res.status).toBe(409);
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("apaga a conta recém-criada se o vínculo no tenant falhar", async () => {
    const h = adminStub({ membershipError: { message: "org unavailable" } });
    const { POST } = await import("@/app/api/v1/team/create-user/route");

    const res = await POST(
      req({
        email: "maria@example.test",
        password: "SenhaForte!2026",
        role: "agent",
        interface_settings: { preset: "completa" },
      }),
    );

    expect(res.status).toBe(500);
    expect(h.createUser).toHaveBeenCalled();
    expect(h.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(audit).not.toHaveBeenCalled();
  });
});

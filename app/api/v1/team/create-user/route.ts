import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { audit, isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { INTERFACE_COMPLETA, interfaceSettingsSchema } from "@/lib/navigation/interface";
import { createTeamUserSchema, validateRequest } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type AdminClient = SupabaseClient & {
  auth: {
    admin: {
      createUser: (attrs: {
        email: string;
        password: string;
        email_confirm: boolean;
        user_metadata?: Record<string, unknown>;
      }) => Promise<{ data: { user: { id: string; email?: string | null } | null }; error: { message: string } | null }>;
      deleteUser: (id: string) => Promise<{ error: { message: string } | null }>;
      getUserById: (id: string) => Promise<{ data: { user?: { email?: string | null } | null }; error: unknown }>;
    };
  };
};

async function emailJaEhMembroAtivo(
  admin: AdminClient,
  organizationId: string,
  email: string,
): Promise<boolean> {
  const { data: members } = await admin
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", organizationId)
    .is("revoked_at", null);

  for (const member of members ?? []) {
    const userId = typeof member.user_id === "string" ? member.user_id : null;
    if (!userId) continue;
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data.user?.email?.trim().toLowerCase() === email) return true;
  }
  return false;
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;
  const t = (texto: string) => traduzir(texto, authUser.idioma);

  if (!isServiceRoleConfigured()) {
    return fail(
      "service_unavailable",
      t("A criação direta precisa da service role do Supabase configurada."),
      503,
      { requestId },
    );
  }

  let input;
  try {
    input = await validateRequest(createTeamUserSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const admin = createAdminClient() as AdminClient;
  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name?.trim() || null;
  const interfaceSettings = interfaceSettingsSchema.parse(
    input.interface_settings ?? INTERFACE_COMPLETA,
  );

  if (await emailJaEhMembroAtivo(admin, activeOrg.orgId, email)) {
    return fail("state_conflict", t("Este e-mail já é membro desta organização."), 409, {
      details: { reason: "already_member" },
      requestId,
    });
  }

  const created = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (created.error || !created.data.user) {
    const message = created.error?.message ?? t("Não foi possível criar o usuário.");
    const normalized = message.toLowerCase();
    const code = normalized.includes("already") || normalized.includes("registered")
      ? "state_conflict"
      : "internal_error";
    return fail(code, message, code === "state_conflict" ? 409 : 500, {
      details: code === "state_conflict" ? { reason: "email_already_registered" } : undefined,
      requestId,
    });
  }

  const userId = created.data.user.id;
  const nowIso = new Date().toISOString();
  const { data: membership, error: membershipErr } = await admin.rpc("fn_accept_team_invite", {
    p_user: userId,
    p_org: activeOrg.orgId,
    p_role: input.role,
    p_invited_by: authUser.id,
    p_issued_at: nowIso,
    p_invited_at: nowIso,
    p_interface_settings: interfaceSettings,
  });

  if (membershipErr) {
    await admin.auth.admin.deleteUser(userId);
    return fail("internal_error", membershipErr.message, 500, { requestId });
  }

  const membershipId =
    membership && typeof membership === "object" && "id" in membership
      ? String((membership as { id: unknown }).id)
      : userId;

  await audit({
    action: "member.created_by_admin",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "membership",
    resourceId: membershipId,
    requestId,
    metadata: {
      target_user_id: userId,
      email,
      full_name: fullName,
      role: input.role,
      email_confirmed: true,
      password_set_by_admin: true,
    },
  });

  return ok(
    {
      user_id: userId,
      email,
      full_name: fullName,
      role: input.role,
      membership_id: membershipId,
    },
    { status: 201, requestId },
  );
}

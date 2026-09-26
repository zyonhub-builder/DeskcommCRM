"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { CONFIRMACAO_RESET_CONTATO_DE_TESTE } from "@/lib/contacts/resetar-contato-de-teste-contrato";
import {
  resetarContatoDeTeste as resetarContatoDeTesteNoBanco,
  type ContagensDoResetDeContatoDeTeste,
} from "@/lib/contacts/resetar-contato-de-teste";
import { env } from "@/lib/env";
import { supportWriteError } from "@/lib/impersonate/support";
import { ambientePermiteResetDeTeste } from "@/lib/lab/ambiente-de-teste";
import { createAdminClient } from "@/lib/supabase/admin";

const entradaSchema = z.object({
  contactId: z.string().uuid(),
  confirmacao: z.string().trim(),
});

export type ResetarContatoDeTesteResult =
  | { ok: true; counts: ContagensDoResetDeContatoDeTeste }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "ambiente_nao_laboratorio"
        | "confirmacao_nao_confere"
        | "not_found"
        | "db_error";
      details?: unknown;
    };

export async function resetarContatoDeTeste(input: {
  contactId: string;
  confirmacao: string;
}): Promise<ResetarContatoDeTesteResult> {
  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  }

  if (parsed.data.confirmacao !== CONFIRMACAO_RESET_CONTATO_DE_TESTE) {
    return { ok: false, error: "confirmacao_nao_confere" };
  }

  if (!ambientePermiteResetDeTeste(env.NEXT_PUBLIC_APP_URL, env.NODE_ENV)) {
    return { ok: false, error: "ambiente_nao_laboratorio" };
  }

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden_role" };

  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false, error: "forbidden_role" };
  }
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const resultado = await resetarContatoDeTesteNoBanco(createAdminClient(), {
    organizationId: activeOrg.orgId,
    contactId: parsed.data.contactId,
  });

  const hdrs = await headers();
  await audit({
    action: "contact.test_reset",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "contact",
    resourceId: parsed.data.contactId,
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
    bypassedRls: true,
    actingAsPlatformAdmin: authUser.is_platform_admin,
    metadata: {
      ambiente: "laboratorio",
      ...(resultado.ok ? { counts: resultado.counts } : { erro: resultado.error }),
    },
  });

  revalidatePath("/app/contacts");
  revalidatePath("/app/contacts/[id]", "page");
  revalidatePath("/app/inbox");
  revalidatePath("/app/pipelines/[id]", "page");
  revalidatePath("/app/agenda");

  if (!resultado.ok) {
    if (resultado.error === "not_found") return { ok: false, error: "not_found" };
    return { ok: false, error: "db_error", details: resultado.details };
  }

  return { ok: true, counts: resultado.counts };
}

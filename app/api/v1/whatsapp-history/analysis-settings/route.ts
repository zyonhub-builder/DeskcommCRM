import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  readWhatsappHistoryAnalysisSettings,
  WHATSAPP_HISTORY_DEFAULT_ANALYSIS_PROMPT,
  writeWhatsappHistoryAnalysisPrompt,
} from "@/lib/whatsapp-history/analysis-settings";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prompt: z.string().trim().min(50).max(12_000),
});

function payloadFromSettings(
  settings: Record<string, unknown> | null | undefined,
  canEdit: boolean,
) {
  const current = readWhatsappHistoryAnalysisSettings(settings);
  return {
    prompt: current.prompt,
    default_prompt: WHATSAPP_HISTORY_DEFAULT_ANALYSIS_PROMPT,
    customized: current.prompt !== WHATSAPP_HISTORY_DEFAULT_ANALYSIS_PROMPT,
    can_edit: canEdit,
  };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", {
    requestId,
    resource: "whatsapp_history_analysis_settings",
  });
  if (!authz.ok) return authz.response;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", authz.org.orgId)
      .maybeSingle();
    if (error) throw error;

    return ok(
      payloadFromSettings(
        data?.settings as Record<string, unknown> | null,
        ROLE_RANK[authz.org.role] >= ROLE_RANK.admin,
      ),
      {
        requestId,
      },
    );
  } catch (error) {
    return fail("database_error", "Não foi possível carregar o prompt de análise.", 500, {
      requestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", {
    requestId,
    resource: "whatsapp_history_analysis_settings",
  });
  if (!authz.ok) return authz.response;

  const supportDenied = await requireSupportWrite(authz.org.orgId);
  if (supportDenied) return supportDenied;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_body", "Prompt inválido.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  try {
    const admin = createAdminClient();
    const { data: orgAtual, error: loadError } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", authz.org.orgId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!orgAtual) return fail("not_found", "Organização não encontrada.", 404, { requestId });

    const settings = writeWhatsappHistoryAnalysisPrompt(
      orgAtual.settings as Record<string, unknown> | null,
      parsed.data.prompt,
    );

    const { data: gravado, error } = await admin
      .from("organizations")
      .update({ settings })
      .eq("id", authz.org.orgId)
      .select("settings")
      .maybeSingle();
    if (error) throw error;
    if (!gravado) {
      return fail("database_error", "Nada foi gravado.", 500, { requestId });
    }

    void audit({
      action: "whatsapp_history.analysis_prompt_updated",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "organization",
      resourceId: authz.org.orgId,
      requestId,
      metadata: {
        prompt_length: parsed.data.prompt.length,
        customized: parsed.data.prompt !== WHATSAPP_HISTORY_DEFAULT_ANALYSIS_PROMPT,
      },
    });

    return ok(payloadFromSettings(gravado.settings as Record<string, unknown> | null, true), {
      requestId,
    });
  } catch (error) {
    return fail("database_error", "Não foi possível salvar o prompt de análise.", 500, {
      requestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

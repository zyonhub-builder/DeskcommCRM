import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { iniciarRodadaDaJornada, iniciarRodadaSchema } from "@/lib/ai/lab/jornadas-reais";
import { failDoLaboratorio, recusarLaboratorioForaDeTeste } from "@/lib/ai/lab/http";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const recusado = recusarLaboratorioForaDeTeste(requestId);
  if (recusado) return recusado;

  const authz = await requireRole("admin", { requestId, resource: "ai_lab" });
  if (!authz.ok) return authz.response;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }

  const parsed = iniciarRodadaSchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("validation_failed", "Confira os dados da rodada.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  try {
    const run = await iniciarRodadaDaJornada(
      createAdminClient(),
      authz.org.orgId,
      authz.user.id,
      parsed.data,
    );
    void audit({
      action: "ai_lab.run_started",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "ai_lab_run",
      resourceId: run.id,
      requestId,
      metadata: {
        scenario_id: run.scenario_id,
        steps: run.script.length,
        reset_existing_contact: parsed.data.reset_existing_contact,
      },
    });
    return ok(run, { status: 201, requestId });
  } catch (err) {
    return failDoLaboratorio(err, requestId);
  }
}

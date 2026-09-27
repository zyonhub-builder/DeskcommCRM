import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import {
  cenarioJornadaSchema,
  listarLaboratorioDeJornadas,
  salvarCenarioDaJornada,
} from "@/lib/ai/lab/jornadas-reais";
import { failDoLaboratorio, recusarLaboratorioForaDeTeste } from "@/lib/ai/lab/http";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const recusado = recusarLaboratorioForaDeTeste(requestId);
  if (recusado) return recusado;

  const authz = await requireRole("admin", { requestId, resource: "ai_lab" });
  if (!authz.ok) return authz.response;

  try {
    const data = await listarLaboratorioDeJornadas(createAdminClient(), authz.org.orgId);
    return ok(data, { requestId });
  } catch (err) {
    return failDoLaboratorio(err, requestId);
  }
}

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

  const parsed = cenarioJornadaSchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("validation_failed", "Confira os dados do cenário.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  try {
    const scenario = await salvarCenarioDaJornada(
      createAdminClient(),
      authz.org.orgId,
      authz.user.id,
      parsed.data,
    );
    void audit({
      action: "ai_lab.scenario_saved",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "ai_lab_scenario",
      resourceId: scenario.id,
      requestId,
      metadata: {
        steps: scenario.steps.length,
        default_delay_seconds: scenario.default_delay_seconds,
        observation_seconds: scenario.observation_seconds,
      },
    });
    return ok(scenario, { status: parsed.data.id ? 200 : 201, requestId });
  } catch (err) {
    return failDoLaboratorio(err, requestId);
  }
}

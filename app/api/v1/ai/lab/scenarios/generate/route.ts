import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { gerarRoteiroDaJornadaComIa, gerarRoteiroJornadaSchema } from "@/lib/ai/lab/jornadas-reais";
import { failDoLaboratorio, recusarLaboratorioForaDeTeste } from "@/lib/ai/lab/http";
import { fail, ok } from "@/lib/api/wrappers";
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

  const parsed = gerarRoteiroJornadaSchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("validation_failed", "Confira os dados para gerar a bateria.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  try {
    const roteiro = await gerarRoteiroDaJornadaComIa(
      createAdminClient(),
      authz.org.orgId,
      parsed.data,
    );
    void audit({
      action: "ai_lab.scenario_generated",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "ai_lab_scenario",
      requestId,
      metadata: {
        agent_id: parsed.data.agent_id ?? null,
        steps: roteiro.steps.length,
        model_id: roteiro.model_id,
        model_origin: roteiro.model_origin,
      },
    });
    return ok(roteiro, { requestId });
  } catch (err) {
    return failDoLaboratorio(err, requestId);
  }
}

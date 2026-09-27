import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { concluirRodadaDaJornada } from "@/lib/ai/lab/jornadas-reais";
import { failDoLaboratorio, recusarLaboratorioForaDeTeste } from "@/lib/ai/lab/http";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const recusado = recusarLaboratorioForaDeTeste(requestId);
  if (recusado) return recusado;

  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("admin", { requestId, resource: "ai_lab" });
  if (!authz.ok) return authz.response;

  try {
    const run = await concluirRodadaDaJornada(createAdminClient(), authz.org.orgId, id);
    void audit({
      action: "ai_lab.run_completed",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "ai_lab_run",
      resourceId: id,
      requestId,
      metadata: {
        findings: run.report?.findings.length ?? 0,
        duration_seconds: run.report?.duration_seconds ?? null,
      },
    });
    return ok(run, { requestId });
  } catch (err) {
    return failDoLaboratorio(err, requestId);
  }
}

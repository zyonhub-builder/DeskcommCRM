import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { executarTickDoLaboratorioDeJornadas } from "@/lib/ai/lab/jornadas-reais";
import { failDoLaboratorio, laboratorioDeJornadasHabilitado } from "@/lib/ai/lab/http";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Credencial de execução inválida.", 403, { requestId });
  }

  if (!laboratorioDeJornadasHabilitado()) {
    return ok(
      { disabled: true, sent: 0, observing: 0, completed: 0, failed: 0, signed_simulated: 0 },
      { requestId },
    );
  }

  try {
    const summary = await executarTickDoLaboratorioDeJornadas(createAdminClient());
    if (summary.sent > 0 || summary.observing > 0 || summary.completed > 0 || summary.failed > 0) {
      void audit({
        action: "ai_lab.worker_run",
        organizationId: null,
        bypassedRls: true,
        requestId,
        metadata: summary,
      });
    }
    return ok(summary, { requestId });
  } catch (err) {
    return failDoLaboratorio(err, requestId);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

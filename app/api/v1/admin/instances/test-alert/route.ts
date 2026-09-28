import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import {
  enviarAlertaDeInstancia,
  motivoLegivelDoAvisoDeInstancia,
} from "@/lib/platform/instance-alerts";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TESTES_POR_HORA = 3;
const JANELA_SEGUNDOS = 3600;

export async function POST(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  let ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    ctx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const balde = await checkRateLimit(
    `platform-instance-alert-test:${ctx.user.id}`,
    TESTES_POR_HORA,
    JANELA_SEGUNDOS,
  );
  if (!balde.allowed) {
    return fail(
      "rate_limited",
      "Você já mandou três testes nesta hora. Espere um pouco antes do próximo.",
      429,
      {
        requestId,
        headers: {
          "Retry-After": String(JANELA_SEGUNDOS),
          "X-RateLimit-Limit": String(balde.limit),
          "X-RateLimit-Remaining": String(Math.max(0, balde.limit - balde.count)),
        },
      },
    );
  }

  const admin = createAdminClient();
  const resultado = await enviarAlertaDeInstancia(admin, {
    eventKind: "test",
    observedAt: new Date(),
    requestId,
  });

  void audit({
    action: "platform.instance_alert_test_sent",
    actorUserId: ctx.user.id,
    resourceType: "platform_instance_alert_settings",
    resourceId: "1",
    bypassedRls: true,
    metadata: {
      status: resultado.status,
      reason: resultado.reason,
      recipient_mask: resultado.recipientMask,
    },
  });

  return ok(
    {
      ...resultado,
      reason_label: motivoLegivelDoAvisoDeInstancia(resultado.reason),
    },
    { requestId },
  );
}

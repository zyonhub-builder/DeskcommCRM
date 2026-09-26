import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { tickWhatsappHistory } from "@/lib/whatsapp-history/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Credencial de execução inválida.", 403, { requestId });
  }

  try {
    return ok(await tickWhatsappHistory(), { requestId });
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    logger.error("[whatsapp-history.cron] tickWhatsappHistory lançou", {
      error: detalhe,
      requestId,
    });
    return fail("internal_error", detalhe, 500, { requestId });
  }
}

export const GET = handle;
export const POST = handle;

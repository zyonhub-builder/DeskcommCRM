import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { syncWhatsappHistoryConnection } from "@/lib/whatsapp-history/worker";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return fail("invalid_payload", "Importação inválida.", 400, { requestId });
  }

  const authz = await requireRole("admin", { requestId, resource: "whatsapp_history_import" });
  if (!authz.ok) return authz.response;
  const supportDenied = await requireSupportWrite(authz.org.orgId);
  if (supportDenied) return supportDenied;

  try {
    const result = await syncWhatsappHistoryConnection({
      organizationId: authz.org.orgId,
      importId: parsedParams.data.id,
      actorUserId: authz.user.id,
      requestId,
    });
    if (!result.found) {
      return fail("not_found", "Importação não encontrada.", 404, { requestId });
    }
    return ok(result, { requestId });
  } catch (error) {
    return fail("database_error", "Não foi possível sincronizar a conexão.", 500, {
      requestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

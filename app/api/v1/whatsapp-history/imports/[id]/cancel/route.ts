import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { getHistoryTransport } from "@/lib/channels/history-transport";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const admin = createAdminClient();
  const { data: row, error: loadError } = await admin
    .from("whatsapp_history_imports")
    .select("id, status, transport_session_name")
    .eq("organization_id", authz.org.orgId)
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  if (loadError) {
    return fail("database_error", "Não foi possível carregar a importação.", 500, {
      requestId,
      details: loadError.message,
    });
  }
  if (!row) return fail("not_found", "Importação não encontrada.", 404, { requestId });
  const importRow = row as { id: string; status: string; transport_session_name: string };

  if (["ready", "failed", "cancelled", "deleted", "expired"].includes(importRow.status)) {
    return ok({ cancelled: false, status: importRow.status }, { requestId });
  }

  const transport = getHistoryTransport();
  if (transport) {
    try {
      await transport.deleteSession(importRow.transport_session_name);
    } catch {
      // Melhor esforço: a linha será marcada como cancelada de qualquer forma.
    }
  }

  const { error } = await admin
    .from("whatsapp_history_imports")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
      lease_until: null,
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", importRow.id);
  if (error) {
    return fail("database_error", "Não foi possível cancelar a importação.", 500, {
      requestId,
      details: error.message,
    });
  }

  void audit({
    action: "whatsapp_history.import_cancelled",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "whatsapp_history_import",
    resourceId: importRow.id,
    requestId,
    metadata: { previous_status: importRow.status },
  });

  return ok({ cancelled: true, status: "cancelled" }, { requestId });
}

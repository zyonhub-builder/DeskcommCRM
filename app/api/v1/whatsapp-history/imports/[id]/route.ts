import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { getHistoryTransport } from "@/lib/channels/history-transport";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadWhatsappHistoryReportsByImport,
  type WhatsappHistoryReportRow,
} from "@/lib/whatsapp-history/report";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

interface ImportDetailRow {
  id: string;
  status: string;
  full_sync: boolean;
  max_chats: number;
  max_messages_per_chat: number;
  chats_total: number;
  chats_imported: number;
  messages_seen: number;
  messages_imported: number;
  media_skipped: number;
  groups_skipped: number;
  last_error_code: string | null;
  last_error_message: string | null;
  retention_until: string;
  created_at: string;
  updated_at: string;
  connected_at: string | null;
  finished_at: string | null;
  transport_session_name: string;
}

function serializeImport(row: ImportDetailRow, report: WhatsappHistoryReportRow | null = null) {
  return {
    id: row.id,
    status: row.status,
    full_sync: row.full_sync,
    max_chats: row.max_chats,
    max_messages_per_chat: row.max_messages_per_chat,
    counters: {
      chats_total: row.chats_total,
      chats_imported: row.chats_imported,
      messages_seen: row.messages_seen,
      messages_imported: row.messages_imported,
      media_skipped: row.media_skipped,
      groups_skipped: row.groups_skipped,
    },
    error: row.last_error_code
      ? { code: row.last_error_code, message: row.last_error_message }
      : null,
    retention_until: row.retention_until,
    created_at: row.created_at,
    updated_at: row.updated_at,
    connected_at: row.connected_at,
    finished_at: row.finished_at,
    report,
  };
}

async function loadImport(orgId: string, id: string): Promise<ImportDetailRow | null> {
  const { data, error } = await createAdminClient()
    .from("whatsapp_history_imports")
    .select(
      "id, status, full_sync, max_chats, max_messages_per_chat, chats_total, chats_imported, messages_seen, messages_imported, media_skipped, groups_skipped, last_error_code, last_error_message, retention_until, created_at, updated_at, connected_at, finished_at, transport_session_name",
    )
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as ImportDetailRow | null) ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return fail("invalid_payload", "Importação inválida.", 400, { requestId });
  }

  const authz = await requireRole("manager", { requestId, resource: "whatsapp_history_import" });
  if (!authz.ok) return authz.response;

  try {
    const row = await loadImport(authz.org.orgId, parsedParams.data.id);
    if (!row) return fail("not_found", "Importação não encontrada.", 404, { requestId });
    const reports = await loadWhatsappHistoryReportsByImport(authz.org.orgId, [row.id]);
    return ok(serializeImport(row, reports.get(row.id) ?? null), { requestId });
  } catch (error) {
    return fail("database_error", "Não foi possível carregar a importação.", 500, {
      requestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function DELETE(
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
  const row = await loadImport(authz.org.orgId, parsedParams.data.id);
  if (!row) return fail("not_found", "Importação não encontrada.", 404, { requestId });

  const transport = getHistoryTransport();
  if (transport) {
    try {
      await transport.deleteSession(row.transport_session_name);
    } catch {
      // Apagar os dados locais tem prioridade; a sessão órfã fica visível pelo prefixo hist_.
    }
  }

  const { error } = await admin
    .from("whatsapp_history_imports")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("id", row.id);
  if (error) {
    return fail("database_error", "Não foi possível apagar a importação.", 500, {
      requestId,
      details: error.message,
    });
  }

  void audit({
    action: "whatsapp_history.import_deleted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "whatsapp_history_import",
    resourceId: row.id,
    requestId,
    metadata: { previous_status: row.status },
  });

  return ok({ deleted: true }, { requestId });
}

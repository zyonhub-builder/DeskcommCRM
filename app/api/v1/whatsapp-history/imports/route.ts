import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  getHistoryTransport,
  historyTransportFriendlyError,
} from "@/lib/channels/history-transport";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  nomeDaSessaoDeHistorico,
  retentionUntil,
  WHATSAPP_HISTORY_CONSENT_VERSION,
  WHATSAPP_HISTORY_MAX_CHATS_DEFAULT,
  WHATSAPP_HISTORY_MAX_MESSAGES_DEFAULT,
} from "@/lib/whatsapp-history/session";
import {
  loadWhatsappHistoryReportsByImport,
  type WhatsappHistoryReportRow,
} from "@/lib/whatsapp-history/report";

export const dynamic = "force-dynamic";

const createImportSchema = z
  .object({
    consent: z.literal(true),
    full_sync: z.boolean().optional().default(false),
    full_sync_acknowledged: z.boolean().optional().default(false),
    max_chats: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .default(WHATSAPP_HISTORY_MAX_CHATS_DEFAULT),
    max_messages_per_chat: z
      .number()
      .int()
      .min(1)
      .max(5000)
      .optional()
      .default(WHATSAPP_HISTORY_MAX_MESSAGES_DEFAULT),
  })
  .superRefine((value, ctx) => {
    if (value.full_sync && !value.full_sync_acknowledged) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["full_sync_acknowledged"],
        message: "full_sync exige confirmação explícita.",
      });
    }
  });

interface ImportListRow {
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
}

function serializeImport(row: ImportListRow, report: WhatsappHistoryReportRow | null = null) {
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

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "whatsapp_history_import" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_history_imports")
    .select(
      "id, status, full_sync, max_chats, max_messages_per_chat, chats_total, chats_imported, messages_seen, messages_imported, media_skipped, groups_skipped, last_error_code, last_error_message, retention_until, created_at, updated_at, connected_at, finished_at",
    )
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return fail("database_error", "Não foi possível listar importações.", 500, {
      requestId,
      details: error.message,
    });
  }

  try {
    const rows = (data ?? []) as ImportListRow[];
    const reports = await loadWhatsappHistoryReportsByImport(
      authz.org.orgId,
      rows.map((row) => row.id),
      admin,
    );

    return ok(
      { imports: rows.map((row) => serializeImport(row, reports.get(row.id) ?? null)) },
      { requestId },
    );
  } catch (reportError) {
    return fail("database_error", "Não foi possível carregar relatórios.", 500, {
      requestId,
      details: reportError instanceof Error ? reportError.message : String(reportError),
    });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "whatsapp_history_import" });
  if (!authz.ok) return authz.response;
  const supportDenied = await requireSupportWrite(authz.org.orgId);
  if (supportDenied) return supportDenied;

  const parsed = createImportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_payload", "Revise as opções da importação.", 400, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const transport = getHistoryTransport();
  if (!transport) {
    return fail("history_transport_unavailable", "Transporte de histórico não configurado.", 503, {
      requestId,
    });
  }

  const admin = createAdminClient();
  const sessionName = nomeDaSessaoDeHistorico(authz.org.orgId);
  const { data: created, error: insertError } = await admin
    .from("whatsapp_history_imports")
    .insert({
      organization_id: authz.org.orgId,
      created_by: authz.user.id,
      status: "qr_pending",
      transport_session_name: sessionName,
      full_sync: parsed.data.full_sync,
      max_chats: parsed.data.max_chats,
      max_messages_per_chat: parsed.data.max_messages_per_chat,
      consent_version: WHATSAPP_HISTORY_CONSENT_VERSION,
      consent_accepted_at: new Date().toISOString(),
      full_sync_acknowledged_at: parsed.data.full_sync ? new Date().toISOString() : null,
      retention_until: retentionUntil(),
      metadata: { source: "ui" },
    })
    .select(
      "id, status, full_sync, max_chats, max_messages_per_chat, chats_total, chats_imported, messages_seen, messages_imported, media_skipped, groups_skipped, last_error_code, last_error_message, retention_until, created_at, updated_at, connected_at, finished_at",
    )
    .single();

  if (insertError || !created) {
    return fail("database_error", "Não foi possível criar a importação.", 500, {
      requestId,
      details: insertError?.message,
    });
  }

  try {
    await transport.startSession(sessionName, { fullSync: parsed.data.full_sync });
  } catch (error) {
    await admin
      .from("whatsapp_history_imports")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        last_error_code: "history_transport_start_failed",
        last_error_message: historyTransportFriendlyError(error).slice(0, 240),
      })
      .eq("organization_id", authz.org.orgId)
      .eq("id", (created as ImportListRow).id);
    return fail("history_transport_error", historyTransportFriendlyError(error), 502, {
      requestId,
    });
  }

  void audit({
    action: "whatsapp_history.import_created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "whatsapp_history_import",
    resourceId: (created as ImportListRow).id,
    requestId,
    metadata: {
      full_sync: parsed.data.full_sync,
      max_chats: parsed.data.max_chats,
      max_messages_per_chat: parsed.data.max_messages_per_chat,
    },
  });

  return ok(serializeImport(created as ImportListRow), { status: 201, requestId });
}

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import {
  csvLine,
  WHATSAPP_HISTORY_CHATS_EXPORT_HEADER,
  WHATSAPP_HISTORY_COMPLETE_MESSAGES_EXPORT_HEADER,
  WHATSAPP_HISTORY_EXPORT_DATASETS,
  WHATSAPP_HISTORY_EXPORT_FORMATS,
  WHATSAPP_HISTORY_MESSAGES_EXPORT_HEADER,
  whatsappHistoryExportFilename,
  type WhatsappHistoryExportDataset,
  type WhatsappHistoryExportFormat,
} from "@/lib/whatsapp-history/export";
import { buildXlsxWorkbook, type XlsxCellValue } from "@/lib/whatsapp-history/xlsx";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 5000;
const MAX_XLSX_ROWS = 100_000;

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  dataset: z.enum(WHATSAPP_HISTORY_EXPORT_DATASETS).default("messages"),
  format: z.enum(WHATSAPP_HISTORY_EXPORT_FORMATS).default("csv"),
});

type AdminClient = ReturnType<typeof createAdminClient>;

interface ImportForExport {
  id: string;
  status: string;
  full_sync: boolean;
  chats_imported: number;
  messages_imported: number;
  retention_until: string;
  created_at: string;
}

interface ChatForExport {
  id: string;
  chat_id_hash: string;
  kind: string;
  status: string;
  messages_seen: number;
  messages_imported: number;
  media_skipped: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageForExport {
  id: string;
  chat_id: string;
  external_id_hash: string | null;
  sent_at: string | null;
  direction: string;
  message_type: string;
  body_length: number;
  has_media: boolean;
  media_mime: string | null;
  created_at: string;
}

interface MessageWithBodyForExport extends MessageForExport {
  body_encrypted: string | null;
}

async function loadImport(admin: AdminClient, organizationId: string, importId: string) {
  const { data, error } = await admin
    .from("whatsapp_history_imports")
    .select("id, status, full_sync, chats_imported, messages_imported, retention_until, created_at")
    .eq("organization_id", organizationId)
    .eq("id", importId)
    .maybeSingle();
  if (error) throw error;
  return (data as ImportForExport | null) ?? null;
}

async function loadChats(admin: AdminClient, organizationId: string, importId: string) {
  const { data, error } = await admin
    .from("whatsapp_history_chats")
    .select(
      "id, chat_id_hash, kind, status, messages_seen, messages_imported, media_skipped, last_message_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("import_id", importId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ChatForExport[]).map((chat) => [chat.id, chat] as const);
}

function importCells(row: ImportForExport) {
  return [row.id, row.created_at, row.full_sync, row.retention_until] as const;
}

function chatCells(importRow: ImportForExport, chat: ChatForExport): XlsxCellValue[] {
  return [
    ...importCells(importRow),
    chat.id,
    chat.chat_id_hash,
    chat.kind,
    chat.status,
    chat.messages_seen,
    chat.messages_imported,
    chat.media_skipped,
    chat.last_message_at,
    chat.created_at,
    chat.updated_at,
  ];
}

function messageCells(
  importRow: ImportForExport,
  chat: ChatForExport | undefined,
  message: MessageForExport,
): XlsxCellValue[] {
  return [
    ...importCells(importRow),
    message.chat_id,
    chat?.chat_id_hash ?? "",
    chat?.kind ?? "",
    chat?.status ?? "",
    message.id,
    message.external_id_hash,
    message.sent_at,
    message.direction,
    message.message_type,
    message.body_length,
    message.has_media,
    message.media_mime,
    message.created_at,
  ];
}

async function messageCellsWithBody(input: {
  admin: AdminClient;
  importRow: ImportForExport;
  chat: ChatForExport | undefined;
  chatLabel: string;
  message: MessageWithBodyForExport;
}): Promise<XlsxCellValue[]> {
  const body = input.message.body_encrypted
    ? ((await decryptWebhookSecret(input.admin, input.message.body_encrypted)) ?? "")
    : "";

  return [
    input.message.sent_at,
    input.chatLabel,
    input.message.direction,
    input.message.message_type,
    body,
    input.message.body_length,
    input.message.has_media,
    input.message.media_mime,
    input.chat?.kind ?? "",
    input.chat?.status ?? "",
    input.chat?.chat_id_hash ?? "",
    input.message.id,
    input.message.external_id_hash,
    input.message.chat_id,
    ...importCells(input.importRow),
    input.message.created_at,
  ];
}

async function* chatCsvLines(input: {
  admin: AdminClient;
  organizationId: string;
  importRow: ImportForExport;
}): AsyncGenerator<string> {
  yield csvLine(WHATSAPP_HISTORY_CHATS_EXPORT_HEADER);
  const chats = await loadChats(input.admin, input.organizationId, input.importRow.id);
  for (const [, chat] of chats) {
    yield csvLine(chatCells(input.importRow, chat));
  }
}

async function* messageCsvLines(input: {
  admin: AdminClient;
  organizationId: string;
  importRow: ImportForExport;
}): AsyncGenerator<string> {
  yield csvLine(WHATSAPP_HISTORY_MESSAGES_EXPORT_HEADER);
  const chats = new Map(await loadChats(input.admin, input.organizationId, input.importRow.id));
  let offset = 0;

  while (true) {
    const { data, error } = await input.admin
      .from("whatsapp_history_messages")
      .select(
        "id, chat_id, external_id_hash, sent_at, direction, message_type, body_length, has_media, media_mime, created_at",
      )
      .eq("organization_id", input.organizationId)
      .eq("import_id", input.importRow.id)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as MessageForExport[];
    for (const message of rows) {
      const chat = chats.get(message.chat_id);
      yield csvLine(messageCells(input.importRow, chat, message));
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
}

async function chatXlsxRows(input: {
  admin: AdminClient;
  organizationId: string;
  importRow: ImportForExport;
}): Promise<XlsxCellValue[][]> {
  const chats = await loadChats(input.admin, input.organizationId, input.importRow.id);
  return [
    [...WHATSAPP_HISTORY_CHATS_EXPORT_HEADER],
    ...chats.map(([, chat]) => chatCells(input.importRow, chat)),
  ];
}

async function messageXlsxRows(input: {
  admin: AdminClient;
  organizationId: string;
  importRow: ImportForExport;
}): Promise<XlsxCellValue[][]> {
  const chats = new Map(await loadChats(input.admin, input.organizationId, input.importRow.id));
  const rows: XlsxCellValue[][] = [[...WHATSAPP_HISTORY_MESSAGES_EXPORT_HEADER]];
  let offset = 0;

  while (true) {
    const { data, error } = await input.admin
      .from("whatsapp_history_messages")
      .select(
        "id, chat_id, external_id_hash, sent_at, direction, message_type, body_length, has_media, media_mime, created_at",
      )
      .eq("organization_id", input.organizationId)
      .eq("import_id", input.importRow.id)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as MessageForExport[];
    for (const message of page) {
      rows.push(messageCells(input.importRow, chats.get(message.chat_id), message));
    }

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function completeMessageXlsxRows(input: {
  admin: AdminClient;
  organizationId: string;
  importRow: ImportForExport;
}): Promise<XlsxCellValue[][]> {
  const chatEntries = await loadChats(input.admin, input.organizationId, input.importRow.id);
  const chats = new Map(chatEntries);
  const chatLabels = new Map(
    chatEntries.map(([id], index) => [id, `conversa_${String(index + 1).padStart(3, "0")}`]),
  );
  const rows: XlsxCellValue[][] = [[...WHATSAPP_HISTORY_COMPLETE_MESSAGES_EXPORT_HEADER]];
  let offset = 0;

  while (true) {
    const { data, error } = await input.admin
      .from("whatsapp_history_messages")
      .select(
        "id, chat_id, external_id_hash, sent_at, direction, message_type, body_encrypted, body_length, has_media, media_mime, created_at",
      )
      .eq("organization_id", input.organizationId)
      .eq("import_id", input.importRow.id)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as MessageWithBodyForExport[];
    for (const message of page) {
      rows.push(
        await messageCellsWithBody({
          admin: input.admin,
          importRow: input.importRow,
          chat: chats.get(message.chat_id),
          chatLabel: chatLabels.get(message.chat_id) ?? "conversa_sem_cadastro",
          message,
        }),
      );
    }

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function streamCsv(lines: AsyncGenerator<string>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const line of lines) {
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

function linesForDataset(input: {
  dataset: WhatsappHistoryExportDataset;
  admin: AdminClient;
  organizationId: string;
  importRow: ImportForExport;
}) {
  if (input.dataset === "chats") {
    return chatCsvLines(input);
  }
  return messageCsvLines(input);
}

async function xlsxSheetsForDataset(input: {
  dataset: WhatsappHistoryExportDataset;
  admin: AdminClient;
  organizationId: string;
  importRow: ImportForExport;
}) {
  if (input.dataset === "chats") {
    return [
      {
        name: "Conversas",
        rows: await chatXlsxRows(input),
      },
    ];
  }
  if (input.dataset === "complete") {
    const [chats, messages] = await Promise.all([
      chatXlsxRows(input),
      completeMessageXlsxRows(input),
    ]);
    return [
      {
        name: "Mensagens",
        rows: messages,
      },
      {
        name: "Conversas",
        rows: chats,
      },
    ];
  }
  return [
    {
      name: "Mensagens",
      rows: await messageXlsxRows(input),
    },
  ];
}

function xlsxRowCount(input: {
  dataset: WhatsappHistoryExportDataset;
  importRow: ImportForExport;
}): number {
  if (input.dataset === "chats") return input.importRow.chats_imported;
  return input.importRow.messages_imported;
}

function contentType(format: WhatsappHistoryExportFormat): string {
  return format === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv; charset=utf-8";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return fail("invalid_payload", "Importação inválida.", 400, { requestId });
  }
  const parsedQuery = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsedQuery.success) {
    return fail("invalid_payload", "Exportação inválida.", 400, {
      requestId,
      details: parsedQuery.error.flatten(),
    });
  }

  const authz = await requireRole("manager", { requestId, resource: "whatsapp_history_export" });
  if (!authz.ok) return authz.response;

  try {
    const admin = createAdminClient();
    const importRow = await loadImport(admin, authz.org.orgId, parsedParams.data.id);
    if (!importRow) return fail("not_found", "Importação não encontrada.", 404, { requestId });
    if (importRow.status !== "ready") {
      return fail("invalid_state", "A importação precisa estar pronta para exportar.", 409, {
        requestId,
      });
    }
    if (parsedQuery.data.dataset === "complete" && parsedQuery.data.format !== "xlsx") {
      return fail("invalid_payload", "O export completo está disponível apenas em XLSX.", 422, {
        requestId,
      });
    }

    const auditDownload = () =>
      void audit({
        action: "whatsapp_history.export_downloaded",
        actorUserId: authz.user.id,
        organizationId: authz.org.orgId,
        resourceType: "whatsapp_history_import",
        resourceId: importRow.id,
        requestId,
        metadata: {
          dataset: parsedQuery.data.dataset,
          format: parsedQuery.data.format,
          chats_imported: importRow.chats_imported,
          messages_imported: importRow.messages_imported,
        },
      });

    if (parsedQuery.data.format === "xlsx") {
      const rowCount = xlsxRowCount({
        dataset: parsedQuery.data.dataset,
        importRow,
      });
      if (rowCount > MAX_XLSX_ROWS) {
        return fail(
          "payload_too_large",
          `O XLSX aceita até ${MAX_XLSX_ROWS} linhas neste export. Use CSV para volumes maiores.`,
          413,
          { requestId },
        );
      }

      const sheets = await xlsxSheetsForDataset({
        dataset: parsedQuery.data.dataset,
        admin,
        organizationId: authz.org.orgId,
        importRow,
      });
      const workbook = buildXlsxWorkbook(sheets);
      const workbookBody = new Uint8Array(workbook).buffer;

      auditDownload();
      return new Response(workbookBody, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": contentType(parsedQuery.data.format),
          "Content-Disposition": `attachment; filename="${whatsappHistoryExportFilename({
            importId: importRow.id,
            dataset: parsedQuery.data.dataset,
            format: parsedQuery.data.format,
          })}"`,
          "X-Request-Id": requestId,
        },
      });
    }

    auditDownload();
    return new Response(
      streamCsv(
        linesForDataset({
          dataset: parsedQuery.data.dataset,
          admin,
          organizationId: authz.org.orgId,
          importRow,
        }),
      ),
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${whatsappHistoryExportFilename({
            importId: importRow.id,
            dataset: parsedQuery.data.dataset,
            format: parsedQuery.data.format,
          })}"`,
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    return fail("database_error", "Não foi possível exportar o histórico.", 500, {
      requestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

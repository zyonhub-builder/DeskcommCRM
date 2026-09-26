import { audit } from "@/lib/audit";
import { getHistoryTransport, type HistoryTransport } from "@/lib/channels/history-transport";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";
import {
  hashWhatsappHistoryValue,
  WHATSAPP_HISTORY_PAGE_SIZE,
  type WhatsappHistoryStatus,
} from "@/lib/whatsapp-history/session";

interface ImportRow {
  id: string;
  organization_id: string;
  created_by: string | null;
  status: WhatsappHistoryStatus;
  transport_session_name: string;
  full_sync: boolean;
  max_chats: number;
  max_messages_per_chat: number;
  lease_until: string | null;
  attempts: number;
  retention_until: string;
}

interface ChatRow {
  id: string;
  organization_id: string;
  import_id: string;
  chat_id_hash: string;
  chat_id_encrypted: string | null;
  status: "queued" | "importing" | "done" | "failed" | "skipped";
  next_offset: number;
  messages_seen: number;
  messages_imported: number;
  media_skipped: number;
}

export interface WhatsappHistoryTickResult {
  expired: number;
  claimed: number;
  imported_chats: number;
  imported_messages: number;
  status?: WhatsappHistoryStatus | "idle";
  error?: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

interface ConnectionSyncRow {
  id: string;
  organization_id: string;
  status: WhatsappHistoryStatus;
  transport_session_name: string;
}

export interface WhatsappHistoryConnectionSyncResult {
  found: boolean;
  changed: boolean;
  status: WhatsappHistoryStatus | null;
  transport_status: string | null;
  error_code?: string;
  error_message?: string;
}

interface WhatsappHistoryConnectionSyncInput {
  organizationId: string;
  importId: string;
  actorUserId?: string;
  requestId?: string;
}

interface WhatsappHistoryConnectionSyncDeps {
  admin?: AdminClient;
  transport?: HistoryTransport | null;
  now?: () => Date;
  auditFn?: typeof audit;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringCandidate(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function arrayCandidate(value: unknown, keys: readonly string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  for (const key of keys) {
    const found = record[key];
    if (Array.isArray(found)) return found;
  }
  return [];
}

function nested(
  record: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!record) return null;
  return asRecord(record[key]);
}

function chatIdDoOverview(raw: unknown): string | null {
  const row = asRecord(raw);
  const id = nested(row, "id");
  const chat = nested(row, "chat");
  const chatId = nested(chat, "id");
  return stringCandidate(
    row?.id,
    row?.chatId,
    row?.conversationId,
    id?._serialized,
    chat?.id,
    chat?.chatId,
    chatId?._serialized,
  );
}

function extrairChatsOverview(raw: unknown): string[] {
  const vistos = new Set<string>();
  const chats: string[] = [];
  for (const item of arrayCandidate(raw, ["chats", "data", "items", "result"])) {
    const chatId = chatIdDoOverview(item);
    if (!chatId || vistos.has(chatId)) continue;
    vistos.add(chatId);
    chats.push(chatId);
  }
  return chats;
}

function tipoDeChat(chatId: string): "direct" | "group" | "unknown" {
  if (chatId.endsWith("@g.us")) return "group";
  if (chatId.endsWith("@c.us") || chatId.endsWith("@s.whatsapp.net") || chatId.endsWith("@lid")) {
    return "direct";
  }
  return "unknown";
}

function extrairMensagens(raw: unknown): unknown[] {
  return arrayCandidate(raw, ["messages", "data", "items", "result"]);
}

function idDaMensagem(raw: unknown): string | null {
  const row = asRecord(raw);
  const id = nested(row, "id");
  const key = nested(row, "key");
  return stringCandidate(
    row?.id,
    row?.messageId,
    id?._serialized,
    id?.id,
    key?.id,
    key?._serialized,
  );
}

function textoDaMensagem(raw: unknown): string | null {
  const row = asRecord(raw);
  const data = nested(row, "_data");
  const message = nested(row, "message");
  const conversation = stringCandidate(message?.conversation);
  return stringCandidate(row?.body, row?.text, row?.caption, data?.body, conversation);
}

function tipoDaMensagem(raw: unknown): string {
  const row = asRecord(raw);
  return stringCandidate(row?.type, row?.messageType, row?.mediaType) ?? "text";
}

function direcaoDaMensagem(raw: unknown): "inbound" | "outbound" | "unknown" {
  const row = asRecord(raw);
  const key = nested(row, "key");
  const fromMe = typeof row?.fromMe === "boolean" ? row.fromMe : key?.fromMe;
  if (fromMe === true) return "outbound";
  if (fromMe === false) return "inbound";
  return "unknown";
}

function enviadaEm(raw: unknown): string | null {
  const row = asRecord(raw);
  const value = row?.timestamp ?? row?.t ?? row?.time ?? row?.createdAt;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  return null;
}

function temMidia(raw: unknown, tipo: string): boolean {
  const row = asRecord(raw);
  return row?.hasMedia === true || Boolean(row?.media) || (tipo !== "text" && tipo !== "chat");
}

function mimeDaMidia(raw: unknown): string | null {
  const row = asRecord(raw);
  const media = nested(row, "media");
  return stringCandidate(row?.mimetype, row?.mimeType, media?.mimetype, media?.mimeType);
}

function erroCurto(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 240);
}

async function deletarSessaoTemporaria(
  transport: HistoryTransport | null,
  sessionName: string,
): Promise<void> {
  if (!transport) return;
  try {
    await transport.deleteSession(sessionName);
  } catch (error) {
    logger.warn("[whatsapp-history] falhei ao apagar sessão temporária", {
      erro: erroCurto(error),
    });
  }
}

export async function syncWhatsappHistoryConnection(
  input: WhatsappHistoryConnectionSyncInput,
  deps: WhatsappHistoryConnectionSyncDeps = {},
): Promise<WhatsappHistoryConnectionSyncResult> {
  const admin = deps.admin ?? createAdminClient();
  const transport = "transport" in deps ? deps.transport : getHistoryTransport();
  const now = deps.now ?? (() => new Date());
  const auditFn = deps.auditFn ?? audit;
  const { data, error } = await admin
    .from("whatsapp_history_imports")
    .select("id, organization_id, status, transport_session_name")
    .eq("organization_id", input.organizationId)
    .eq("id", input.importId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return { found: false, changed: false, status: null, transport_status: null };
  }

  const row = data as ConnectionSyncRow;
  if (row.status !== "qr_pending") {
    return { found: true, changed: false, status: row.status, transport_status: null };
  }

  if (!transport) {
    return {
      found: true,
      changed: false,
      status: "qr_pending",
      transport_status: null,
      error_code: "history_transport_not_configured",
      error_message: "Transporte de histórico não configurado.",
    };
  }

  const session = await transport.getSession(row.transport_session_name);
  if (!session) {
    const finishedAt = now().toISOString();
    const { error: updateError } = await admin
      .from("whatsapp_history_imports")
      .update({
        status: "failed",
        lease_until: null,
        finished_at: finishedAt,
        last_error_code: "history_transport_session_missing",
        last_error_message: "A sessão temporária do transporte não existe mais.",
      })
      .eq("organization_id", row.organization_id)
      .eq("id", row.id)
      .eq("status", "qr_pending");
    if (updateError) throw updateError;
    void auditFn({
      action: "whatsapp_history.import_failed",
      actorUserId: input.actorUserId,
      organizationId: row.organization_id,
      resourceType: "whatsapp_history_import",
      resourceId: row.id,
      requestId: input.requestId,
      metadata: { reason: "history_transport_session_missing" },
    });
    return {
      found: true,
      changed: true,
      status: "failed",
      transport_status: null,
      error_code: "history_transport_session_missing",
      error_message: "A sessão temporária do transporte não existe mais.",
    };
  }

  if (session.status !== "WORKING") {
    return {
      found: true,
      changed: false,
      status: "qr_pending",
      transport_status: session.status,
    };
  }

  const connectedAt = now().toISOString();
  const { error: updateError } = await admin
    .from("whatsapp_history_imports")
    .update({
      status: "importing",
      connected_at: connectedAt,
      lease_until: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("organization_id", row.organization_id)
    .eq("id", row.id)
    .eq("status", "qr_pending");
  if (updateError) throw updateError;

  void auditFn({
    action: "whatsapp_history.import_connected",
    actorUserId: input.actorUserId,
    organizationId: row.organization_id,
    resourceType: "whatsapp_history_import",
    resourceId: row.id,
    requestId: input.requestId,
    metadata: { transport_status: session.status },
  });

  return {
    found: true,
    changed: true,
    status: "importing",
    transport_status: session.status,
  };
}

async function expurgarVencidos(admin: AdminClient): Promise<number> {
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("whatsapp_history_imports")
    .delete()
    .lt("retention_until", agora)
    .in("status", ["ready", "failed", "cancelled", "expired"])
    .select("id, organization_id, transport_session_name");
  if (error) throw error;
  const removidos = (data ?? []) as Array<{
    id: string;
    organization_id: string;
    transport_session_name: string;
  }>;
  const transport = getHistoryTransport();
  for (const row of removidos) {
    await deletarSessaoTemporaria(transport, row.transport_session_name);
    void audit({
      action: "whatsapp_history.import_expired",
      organizationId: row.organization_id,
      resourceType: "whatsapp_history_import",
      resourceId: row.id,
      bypassedRls: true,
    });
  }
  return removidos.length;
}

async function reclamarImportacao(admin: AdminClient): Promise<ImportRow | null> {
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("whatsapp_history_imports")
    .select(
      "id, organization_id, created_by, status, transport_session_name, full_sync, max_chats, max_messages_per_chat, lease_until, attempts, retention_until",
    )
    .in("status", ["qr_pending", "importing"])
    .order("updated_at", { ascending: true })
    .limit(10);
  if (error) throw error;

  const candidate = ((data ?? []) as ImportRow[]).find(
    (row) => !row.lease_until || row.lease_until < agora,
  );
  if (!candidate) return null;

  const { data: claimed, error: updateError } = await admin
    .from("whatsapp_history_imports")
    .update({
      lease_until: new Date(Date.now() + 2 * 60_000).toISOString(),
      attempts: (candidate.attempts ?? 0) + 1,
    })
    .eq("organization_id", candidate.organization_id)
    .eq("id", candidate.id)
    .eq("status", candidate.status)
    .select(
      "id, organization_id, created_by, status, transport_session_name, full_sync, max_chats, max_messages_per_chat, lease_until, attempts, retention_until",
    )
    .maybeSingle();
  if (updateError) throw updateError;
  return (claimed as ImportRow | null) ?? null;
}

async function marcarFalha(
  admin: AdminClient,
  job: ImportRow,
  error: unknown,
  fatal = (job.attempts ?? 0) >= 5,
): Promise<WhatsappHistoryStatus> {
  const status: WhatsappHistoryStatus = fatal ? "failed" : job.status;
  await admin
    .from("whatsapp_history_imports")
    .update({
      status,
      lease_until: null,
      last_error_code: "worker_error",
      last_error_message: erroCurto(error),
      ...(fatal ? { finished_at: new Date().toISOString() } : {}),
    })
    .eq("organization_id", job.organization_id)
    .eq("id", job.id);
  if (fatal) {
    void audit({
      action: "whatsapp_history.import_failed",
      organizationId: job.organization_id,
      resourceType: "whatsapp_history_import",
      resourceId: job.id,
      bypassedRls: true,
      metadata: { attempts: job.attempts ?? 0 },
    });
  }
  return status;
}

async function garantirConexao(
  admin: AdminClient,
  transport: HistoryTransport,
  job: ImportRow,
): Promise<boolean> {
  const session = await transport.getSession(job.transport_session_name);
  if (!session) {
    await admin
      .from("whatsapp_history_imports")
      .update({
        status: "failed",
        lease_until: null,
        finished_at: new Date().toISOString(),
        last_error_code: "history_transport_session_missing",
        last_error_message: "A sessão temporária do transporte não existe mais.",
      })
      .eq("organization_id", job.organization_id)
      .eq("id", job.id);
    return false;
  }

  if (session.status === "WORKING") {
    await admin
      .from("whatsapp_history_imports")
      .update({
        status: "importing",
        connected_at: new Date().toISOString(),
        lease_until: null,
        last_error_code: null,
        last_error_message: null,
      })
      .eq("organization_id", job.organization_id)
      .eq("id", job.id);
    return false;
  }

  await admin
    .from("whatsapp_history_imports")
    .update({ lease_until: null })
    .eq("organization_id", job.organization_id)
    .eq("id", job.id);
  return false;
}

async function prepararChats(
  admin: AdminClient,
  transport: HistoryTransport,
  job: ImportRow,
): Promise<number> {
  const { count, error: countError } = await admin
    .from("whatsapp_history_chats")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", job.organization_id)
    .eq("import_id", job.id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) return 0;

  const overview = await transport.listChatsOverview(job.transport_session_name);
  const chatIds = extrairChatsOverview(overview).slice(0, job.max_chats);
  let pulados = 0;
  const rows = [];
  for (const chatId of chatIds) {
    const kind = tipoDeChat(chatId);
    if (kind !== "direct") {
      pulados += 1;
      continue;
    }
    const encrypted = await encryptWebhookSecret(admin, chatId);
    if (!encrypted) throw new Error("whatsapp_history_chat_cipher_unavailable");
    rows.push({
      organization_id: job.organization_id,
      import_id: job.id,
      chat_id_hash: hashWhatsappHistoryValue(chatId),
      chat_id_encrypted: encrypted,
      kind,
      status: "queued",
    });
  }

  if (rows.length > 0) {
    const { error } = await admin.from("whatsapp_history_chats").upsert(rows, {
      onConflict: "organization_id,import_id,chat_id_hash",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }

  await admin
    .from("whatsapp_history_imports")
    .update({ chats_total: chatIds.length, groups_skipped: pulados })
    .eq("organization_id", job.organization_id)
    .eq("id", job.id);

  return rows.length;
}

async function inserirMensagens(
  admin: AdminClient,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await admin.from("whatsapp_history_messages").insert(rows);
  if (!error) return rows.length;
  if (error.code !== "23505") throw error;

  let inserted = 0;
  for (const row of rows) {
    const result = await admin.from("whatsapp_history_messages").insert(row);
    if (!result.error) {
      inserted += 1;
      continue;
    }
    if (result.error.code !== "23505") throw result.error;
  }
  return inserted;
}

async function processarChat(
  admin: AdminClient,
  transport: HistoryTransport,
  job: ImportRow,
  chat: ChatRow,
): Promise<{ messages: number; media: number }> {
  if (!chat.chat_id_encrypted) {
    await admin
      .from("whatsapp_history_chats")
      .update({
        status: "failed",
        last_error_code: "chat_id_missing",
        last_error_message: "Identificador cifrado ausente.",
      })
      .eq("organization_id", chat.organization_id)
      .eq("id", chat.id);
    return { messages: 0, media: 0 };
  }

  const chatId = await decryptWebhookSecret(admin, chat.chat_id_encrypted);
  if (!chatId) throw new Error("whatsapp_history_chat_decrypt_failed");

  const offset = chat.next_offset;
  const restantes = job.max_messages_per_chat - offset;
  if (restantes <= 0) {
    await admin
      .from("whatsapp_history_chats")
      .update({ status: "done" })
      .eq("organization_id", chat.organization_id)
      .eq("id", chat.id);
    return { messages: 0, media: 0 };
  }

  const limit = Math.min(WHATSAPP_HISTORY_PAGE_SIZE, restantes);
  const payload = await transport.listChatMessages(job.transport_session_name, chatId, {
    limit,
    offset,
  });
  const mensagens = extrairMensagens(payload);
  if (mensagens.length === 0) {
    await admin
      .from("whatsapp_history_chats")
      .update({ status: "done" })
      .eq("organization_id", chat.organization_id)
      .eq("id", chat.id);
    return { messages: 0, media: 0 };
  }

  const rows: Array<Record<string, unknown>> = [];
  let media = 0;
  let ultimaData: string | null = null;
  for (const raw of mensagens) {
    const externalId = idDaMensagem(raw);
    const body = textoDaMensagem(raw);
    const tipo = tipoDaMensagem(raw);
    const hasMedia = temMidia(raw, tipo);
    if (hasMedia) media += 1;
    const sentAt = enviadaEm(raw);
    ultimaData = sentAt ?? ultimaData;
    const bodyEncrypted = body ? await encryptWebhookSecret(admin, body) : null;
    if (body && !bodyEncrypted) throw new Error("whatsapp_history_message_cipher_unavailable");

    rows.push({
      organization_id: job.organization_id,
      import_id: job.id,
      chat_id: chat.id,
      external_id_hash: externalId ? hashWhatsappHistoryValue(externalId) : null,
      body_hash: body ? hashWhatsappHistoryValue(body) : null,
      direction: direcaoDaMensagem(raw),
      message_type: tipo.slice(0, 80),
      body_encrypted: bodyEncrypted,
      body_length: body ? body.length : 0,
      has_media: hasMedia,
      media_mime: mimeDaMidia(raw),
      sent_at: sentAt,
      metadata: {
        imported_by: "whatsapp_history_worker",
        raw_type: tipo.slice(0, 80),
      },
    });
  }

  const inseridas = await inserirMensagens(admin, rows);
  const proximoOffset = offset + mensagens.length;
  const terminou = mensagens.length < limit || proximoOffset >= job.max_messages_per_chat;
  await admin
    .from("whatsapp_history_chats")
    .update({
      status: terminou ? "done" : "importing",
      next_offset: proximoOffset,
      messages_seen: chat.messages_seen + mensagens.length,
      messages_imported: chat.messages_imported + inseridas,
      media_skipped: chat.media_skipped + media,
      last_message_at: ultimaData,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("organization_id", chat.organization_id)
    .eq("id", chat.id);

  return { messages: inseridas, media };
}

async function recalcularContadores(admin: AdminClient, job: ImportRow): Promise<boolean> {
  const { data: chats, error: chatsError } = await admin
    .from("whatsapp_history_chats")
    .select("status, messages_seen, messages_imported, media_skipped")
    .eq("organization_id", job.organization_id)
    .eq("import_id", job.id);
  if (chatsError) throw chatsError;

  const rows = (chats ?? []) as Array<{
    status: string;
    messages_seen: number | null;
    messages_imported: number | null;
    media_skipped: number | null;
  }>;
  const pendentes = rows.some((row) => row.status === "queued" || row.status === "importing");
  const update = {
    chats_imported: rows.filter((row) => row.status === "done").length,
    messages_seen: rows.reduce((sum, row) => sum + (row.messages_seen ?? 0), 0),
    messages_imported: rows.reduce((sum, row) => sum + (row.messages_imported ?? 0), 0),
    media_skipped: rows.reduce((sum, row) => sum + (row.media_skipped ?? 0), 0),
  };
  await admin
    .from("whatsapp_history_imports")
    .update(update)
    .eq("organization_id", job.organization_id)
    .eq("id", job.id);
  return !pendentes && rows.length > 0;
}

async function finalizarSePronto(
  admin: AdminClient,
  transport: HistoryTransport | null,
  job: ImportRow,
): Promise<boolean> {
  const pronto = await recalcularContadores(admin, job);
  if (!pronto) return false;
  await admin
    .from("whatsapp_history_imports")
    .update({
      status: "ready",
      finished_at: new Date().toISOString(),
      lease_until: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("organization_id", job.organization_id)
    .eq("id", job.id);
  await deletarSessaoTemporaria(transport, job.transport_session_name);
  void audit({
    action: "whatsapp_history.import_completed",
    organizationId: job.organization_id,
    resourceType: "whatsapp_history_import",
    resourceId: job.id,
    bypassedRls: true,
  });
  return true;
}

async function processarImportacao(
  admin: AdminClient,
  job: ImportRow,
): Promise<{ status: WhatsappHistoryStatus; chats: number; messages: number }> {
  const transport = getHistoryTransport();
  if (!transport) {
    await admin
      .from("whatsapp_history_imports")
      .update({
        status: "failed",
        lease_until: null,
        finished_at: new Date().toISOString(),
        last_error_code: "history_transport_not_configured",
        last_error_message: "Transporte de histórico não configurado.",
      })
      .eq("organization_id", job.organization_id)
      .eq("id", job.id);
    return { status: "failed", chats: 0, messages: 0 };
  }

  if (job.status === "qr_pending") {
    await garantirConexao(admin, transport, job);
    return { status: "qr_pending", chats: 0, messages: 0 };
  }

  const chatsCriados = await prepararChats(admin, transport, job);
  const { data: chats, error } = await admin
    .from("whatsapp_history_chats")
    .select(
      "id, organization_id, import_id, chat_id_hash, chat_id_encrypted, status, next_offset, messages_seen, messages_imported, media_skipped",
    )
    .eq("organization_id", job.organization_id)
    .eq("import_id", job.id)
    .in("status", ["queued", "importing"])
    .order("updated_at", { ascending: true })
    .limit(5);
  if (error) throw error;

  let mensagens = 0;
  for (const chat of (chats ?? []) as ChatRow[]) {
    try {
      const resultado = await processarChat(admin, transport, job, chat);
      mensagens += resultado.messages;
    } catch (chatError) {
      await admin
        .from("whatsapp_history_chats")
        .update({
          status: "failed",
          last_error_code: "chat_worker_error",
          last_error_message: erroCurto(chatError),
        })
        .eq("organization_id", chat.organization_id)
        .eq("id", chat.id);
    }
  }

  const finalizado = await finalizarSePronto(admin, transport, job);
  if (!finalizado) {
    await admin
      .from("whatsapp_history_imports")
      .update({ lease_until: null })
      .eq("organization_id", job.organization_id)
      .eq("id", job.id);
  }
  return { status: finalizado ? "ready" : "importing", chats: chatsCriados, messages: mensagens };
}

export async function tickWhatsappHistory(): Promise<WhatsappHistoryTickResult> {
  const admin = createAdminClient();
  const expired = await expurgarVencidos(admin);
  const job = await reclamarImportacao(admin);
  if (!job) {
    return { expired, claimed: 0, imported_chats: 0, imported_messages: 0, status: "idle" };
  }

  try {
    const resultado = await processarImportacao(admin, job);
    return {
      expired,
      claimed: 1,
      imported_chats: resultado.chats,
      imported_messages: resultado.messages,
      status: resultado.status,
    };
  } catch (error) {
    const status = await marcarFalha(admin, job, error);
    logger.warn("[whatsapp-history] tick falhou", {
      job_id: job.id,
      organization_id: job.organization_id,
      erro: erroCurto(error),
      status,
    });
    return {
      expired,
      claimed: 1,
      imported_chats: 0,
      imported_messages: 0,
      status,
      error: erroCurto(error),
    };
  }
}

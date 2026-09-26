import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const WHATSAPP_HISTORY_REPORT_VERSION = "whatsapp_history_report_v1";
export const WHATSAPP_HISTORY_REPORT_MESSAGE_SAMPLE = 100_000;

type AdminClient = ReturnType<typeof createAdminClient>;

type Severity = "high" | "medium" | "low";

export interface WhatsappHistoryReportFinding {
  severity: Severity;
  title: string;
  detail: string;
  metric: string;
  next_step: string;
}

export interface WhatsappHistoryReportPayload {
  report_version: string;
  summary: string;
  metrics: Record<string, unknown>;
  findings: WhatsappHistoryReportFinding[];
  limitations: string[];
}

export interface WhatsappHistoryReportRow extends WhatsappHistoryReportPayload {
  id: string;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

interface ImportForReport {
  id: string;
  organization_id: string;
  status: string;
  max_chats: number;
  max_messages_per_chat: number;
  chats_total: number;
  chats_imported: number;
  messages_seen: number;
  messages_imported: number;
  media_skipped: number;
  groups_skipped: number;
  created_at: string;
  finished_at: string | null;
}

interface ChatForReport {
  id: string;
  status: string;
  messages_seen: number | null;
  messages_imported: number | null;
  media_skipped: number | null;
  last_message_at: string | null;
}

interface MessageForReport {
  chat_id: string;
  direction: "inbound" | "outbound" | "unknown";
  sent_at: string | null;
  has_media: boolean | null;
}

export class WhatsappHistoryReportError extends Error {
  constructor(
    public readonly code: "not_found" | "not_ready" | "database_error",
    message: string,
  ) {
    super(message);
    this.name = "WhatsappHistoryReportError";
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  if (value === undefined) return null;
  if (sorted.length % 2 === 1) return value;
  const previous = sorted[middle - 1];
  return previous === undefined ? value : Math.round((previous + value) / 2);
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index] ?? null;
}

function minutesBetween(start: string, end: string): number | null {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 60_000);
}

function businessHourUtc(iso: string | null): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const hour = date.getUTCHours();
  return hour >= 8 && hour < 18;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function sentenceForSummary(findings: WhatsappHistoryReportFinding[], importRow: ImportForReport) {
  if (importRow.messages_imported === 0) {
    return "A importação não trouxe mensagens suficientes para apontar gargalos operacionais.";
  }
  const high = findings.filter((finding) => finding.severity === "high").length;
  const medium = findings.filter((finding) => finding.severity === "medium").length;
  if (high > 0) return `Foram encontrados ${high} gap(s) críticos e ${medium} ponto(s) de atenção.`;
  if (medium > 0) return `Foram encontrados ${medium} ponto(s) de atenção no histórico importado.`;
  return "A amostra importada não mostrou gaps fortes pelos sinais automáticos desta POC.";
}

export function buildWhatsappHistoryReport(input: {
  importRow: ImportForReport;
  chats: ChatForReport[];
  messages: MessageForReport[];
  sampledMessages: number;
}): WhatsappHistoryReportPayload {
  const messagesByChat = new Map<string, MessageForReport[]>();
  for (const message of input.messages) {
    const existing = messagesByChat.get(message.chat_id) ?? [];
    existing.push(message);
    messagesByChat.set(message.chat_id, existing);
  }

  const firstResponseMinutes: number[] = [];
  let unansweredChats = 0;
  let chatsWithoutOutbound = 0;
  let chatsWithInbound = 0;
  let inboundMessages = 0;
  let outboundMessages = 0;
  let unknownMessages = 0;
  let inboundOutsideBusinessHours = 0;

  for (const [chatId, messages] of messagesByChat) {
    const ordered = [...messages].sort((a, b) => {
      const aTime = a.sent_at ? Date.parse(a.sent_at) : 0;
      const bTime = b.sent_at ? Date.parse(b.sent_at) : 0;
      return aTime - bTime;
    });
    const hasInbound = ordered.some((message) => message.direction === "inbound");
    const hasOutbound = ordered.some((message) => message.direction === "outbound");
    if (hasInbound) chatsWithInbound += 1;
    if (hasInbound && !hasOutbound) chatsWithoutOutbound += 1;

    for (const message of ordered) {
      if (message.direction === "inbound") {
        inboundMessages += 1;
        if (!businessHourUtc(message.sent_at)) inboundOutsideBusinessHours += 1;
      } else if (message.direction === "outbound") {
        outboundMessages += 1;
      } else {
        unknownMessages += 1;
      }
    }

    const lastKnown = [...ordered].reverse().find((message) => message.direction !== "unknown");
    if (lastKnown?.direction === "inbound") unansweredChats += 1;

    const firstInbound = ordered.find((message) => message.direction === "inbound" && message.sent_at);
    if (!firstInbound?.sent_at) continue;
    const firstOutboundAfter = ordered.find(
      (message) =>
        message.direction === "outbound" &&
        message.sent_at &&
        Date.parse(message.sent_at) > Date.parse(firstInbound.sent_at!),
    );
    if (!firstOutboundAfter?.sent_at) continue;
    const minutes = minutesBetween(firstInbound.sent_at, firstOutboundAfter.sent_at);
    if (minutes !== null) firstResponseMinutes.push(minutes);

    // Garante que chats sem mensagens conhecidas não somem silenciosamente da métrica.
    if (!messagesByChat.has(chatId)) messagesByChat.set(chatId, []);
  }

  const medianFirstResponse = median(firstResponseMinutes);
  const p90FirstResponse = percentile(firstResponseMinutes, 90);
  const sampleLimited = input.importRow.messages_imported > input.sampledMessages;
  const hitChatLimit = input.importRow.chats_total >= input.importRow.max_chats;
  const hitMessageLimit = input.chats.some(
    (chat) => (chat.messages_seen ?? 0) >= input.importRow.max_messages_per_chat,
  );

  const findings: WhatsappHistoryReportFinding[] = [];
  if (unansweredChats > 0) {
    findings.push({
      severity: unansweredChats >= 5 || percent(unansweredChats, chatsWithInbound) >= 25 ? "high" : "medium",
      title: "Conversas terminaram com o cliente sem resposta posterior",
      detail: `${unansweredChats} chat(s) tiveram a última mensagem conhecida como entrada do cliente.`,
      metric: "unanswered_chats",
      next_step: "Revisar a fila e criar follow-up para contatos que ficaram sem retorno.",
    });
  }
  if (chatsWithoutOutbound > 0) {
    findings.push({
      severity: chatsWithoutOutbound >= 3 ? "high" : "medium",
      title: "Chats importados sem nenhuma resposta enviada",
      detail: `${chatsWithoutOutbound} chat(s) têm mensagem do cliente e nenhuma saída registrada na amostra.`,
      metric: "chats_without_outbound",
      next_step: "Conferir se estes contatos deveriam entrar no atendimento ativo ou numa campanha de retomada.",
    });
  }
  if (medianFirstResponse !== null && medianFirstResponse >= 60) {
    findings.push({
      severity: medianFirstResponse >= 240 ? "high" : "medium",
      title: "Primeira resposta lenta",
      detail: `A mediana da primeira resposta foi de ${medianFirstResponse} minuto(s).`,
      metric: "median_first_response_minutes",
      next_step: "Comparar horários de pico com escala humana e janela do agente antes de ajustar automação.",
    });
  }
  if (inboundMessages > 0 && percent(inboundOutsideBusinessHours, inboundMessages) >= 30) {
    findings.push({
      severity: "medium",
      title: "Demanda fora do horário comercial",
      detail: `${percent(inboundOutsideBusinessHours, inboundMessages)}% das entradas caíram fora da janela UTC 08h-18h.`,
      metric: "inbound_outside_business_hours_percent",
      next_step: "Configurar cobertura de IA/follow-up para os horários em que a equipe não responde.",
    });
  }
  if (hitChatLimit || hitMessageLimit || sampleLimited) {
    findings.push({
      severity: "low",
      title: "A leitura pode estar parcial",
      detail: "A importação ou o relatório encontrou limite de chats, mensagens por chat ou amostragem.",
      metric: "partial_import_or_report",
      next_step: "Gerar nova importação com limites maiores antes de tomar decisão definitiva.",
    });
  }
  if (input.importRow.media_skipped > 0) {
    findings.push({
      severity: "low",
      title: "Mídias ficaram fora da análise",
      detail: `${input.importRow.media_skipped} mídia(s) foram contadas, mas não baixadas nem interpretadas nesta POC.`,
      metric: "media_skipped",
      next_step: "Tratar este relatório como análise textual/operacional e não como auditoria completa da conversa.",
    });
  }

  const limitations = [
    "Este relatório não usa IA; é uma leitura automática por regras e métricas operacionais.",
    "Não lemos nem exibimos o corpo das mensagens nesta versão do relatório.",
    "Horário comercial medido em UTC 08h-18h; o fuso da organização ainda não entra nesta régua.",
    "Mídias não são baixadas nem analisadas.",
    ...(sampleLimited
      ? [`O relatório analisou ${input.sampledMessages} de ${input.importRow.messages_imported} mensagens importadas.`]
      : []),
  ];

  return {
    report_version: WHATSAPP_HISTORY_REPORT_VERSION,
    summary: sentenceForSummary(findings, input.importRow),
    metrics: {
      analysis_method: "rules_v1",
      ai_used: false,
      chats_total: input.importRow.chats_total,
      chats_imported: input.importRow.chats_imported,
      chats_with_messages: messagesByChat.size,
      chats_with_inbound: chatsWithInbound,
      chats_without_outbound: chatsWithoutOutbound,
      unanswered_chats: unansweredChats,
      messages_imported: input.importRow.messages_imported,
      messages_sampled: input.sampledMessages,
      inbound_messages: inboundMessages,
      outbound_messages: outboundMessages,
      unknown_direction_messages: unknownMessages,
      first_response_measured_chats: firstResponseMinutes.length,
      median_first_response_minutes: medianFirstResponse,
      p90_first_response_minutes: p90FirstResponse,
      inbound_outside_business_hours: inboundOutsideBusinessHours,
      inbound_outside_business_hours_percent: percent(inboundOutsideBusinessHours, inboundMessages),
      media_skipped: input.importRow.media_skipped,
      groups_skipped: input.importRow.groups_skipped,
      partial: {
        hit_chat_limit: hitChatLimit,
        hit_message_limit: hitMessageLimit,
        report_sample_limited: sampleLimited,
      },
    },
    findings,
    limitations,
  };
}

function serializeReport(row: Record<string, unknown>): WhatsappHistoryReportRow {
  return {
    id: String(row.id),
    report_version: String(row.report_version),
    summary: String(row.summary),
    metrics: (row.metrics && typeof row.metrics === "object" ? row.metrics : {}) as Record<string, unknown>,
    findings: Array.isArray(row.findings) ? (row.findings as WhatsappHistoryReportFinding[]) : [],
    limitations: Array.isArray(row.limitations) ? (row.limitations as string[]) : [],
    generated_at: String(row.generated_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function loadWhatsappHistoryReportsByImport(
  organizationId: string,
  importIds: string[],
  admin: AdminClient = createAdminClient(),
): Promise<Map<string, WhatsappHistoryReportRow>> {
  if (importIds.length === 0) return new Map();
  const { data, error } = await admin
    .from("whatsapp_history_reports")
    .select(
      "id, import_id, report_version, summary, metrics, findings, limitations, generated_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .in("import_id", importIds);
  if (error) throw error;
  const reports = new Map<string, WhatsappHistoryReportRow>();
  for (const row of (data ?? []) as Array<Record<string, unknown> & { import_id: string }>) {
    reports.set(row.import_id, serializeReport(row));
  }
  return reports;
}

export async function generateWhatsappHistoryReport(input: {
  organizationId: string;
  importId: string;
  actorUserId: string;
  requestId?: string;
  admin?: AdminClient;
}): Promise<WhatsappHistoryReportRow> {
  const admin = input.admin ?? createAdminClient();
  const { data: importRow, error: importError } = await admin
    .from("whatsapp_history_imports")
    .select(
      "id, organization_id, status, max_chats, max_messages_per_chat, chats_total, chats_imported, messages_seen, messages_imported, media_skipped, groups_skipped, created_at, finished_at",
    )
    .eq("organization_id", input.organizationId)
    .eq("id", input.importId)
    .maybeSingle();
  if (importError) throw new WhatsappHistoryReportError("database_error", importError.message);
  if (!importRow) throw new WhatsappHistoryReportError("not_found", "Importação não encontrada.");
  const typedImport = importRow as ImportForReport;
  if (typedImport.status !== "ready") {
    throw new WhatsappHistoryReportError("not_ready", "A importação precisa estar pronta.");
  }

  const { data: chats, error: chatsError } = await admin
    .from("whatsapp_history_chats")
    .select("id, status, messages_seen, messages_imported, media_skipped, last_message_at")
    .eq("organization_id", input.organizationId)
    .eq("import_id", input.importId);
  if (chatsError) throw new WhatsappHistoryReportError("database_error", chatsError.message);

  const { data: messages, error: messagesError } = await admin
    .from("whatsapp_history_messages")
    .select("chat_id, direction, sent_at, has_media")
    .eq("organization_id", input.organizationId)
    .eq("import_id", input.importId)
    .order("sent_at", { ascending: true })
    .limit(WHATSAPP_HISTORY_REPORT_MESSAGE_SAMPLE);
  if (messagesError) throw new WhatsappHistoryReportError("database_error", messagesError.message);

  const payload = buildWhatsappHistoryReport({
    importRow: typedImport,
    chats: (chats ?? []) as ChatForReport[],
    messages: (messages ?? []) as MessageForReport[],
    sampledMessages: (messages ?? []).length,
  });

  const generatedAt = new Date().toISOString();
  const { data: saved, error: saveError } = await admin
    .from("whatsapp_history_reports")
    .upsert(
      {
        organization_id: input.organizationId,
        import_id: input.importId,
        generated_by: input.actorUserId,
        report_version: payload.report_version,
        summary: payload.summary,
        metrics: payload.metrics,
        findings: payload.findings,
        limitations: payload.limitations,
        generated_at: generatedAt,
      },
      { onConflict: "organization_id,import_id" },
    )
    .select("id, report_version, summary, metrics, findings, limitations, generated_at, created_at, updated_at")
    .single();
  if (saveError) throw new WhatsappHistoryReportError("database_error", saveError.message);

  void audit({
    action: "whatsapp_history.report_generated",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    resourceType: "whatsapp_history_report",
    resourceId: String(saved.id),
    requestId: input.requestId,
    metadata: {
      import_id: input.importId,
      findings: payload.findings.length,
      messages_sampled: payload.metrics.messages_sampled,
    },
  });

  return serializeReport(saved as Record<string, unknown>);
}

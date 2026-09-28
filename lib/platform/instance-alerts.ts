import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarPacingDoCanal } from "@/lib/agent-engine/pacing/ledger-supabase";
import {
  CHANNEL_SESSION_REF_COLUMNS,
  capabilitiesOf,
  getAdapter,
  resolveSessionRef,
  transportaMensagem,
  type ChannelProvider,
  type ChannelSessionRef,
} from "@/lib/channels";
import { STATUS_SAUDAVEL } from "@/lib/channels/health";
import { logger } from "@/lib/logger";

export type TipoDeDestinoDoAvisoDeInstancia = "phone" | "group";
export type TipoDeEventoDoAvisoDeInstancia = "down" | "recovered" | "test";
export type StatusDaEntregaDoAvisoDeInstancia = "sent" | "skipped" | "failed";

export interface ConfiguracaoDeAvisoDeInstancia {
  id: number;
  enabled: boolean;
  channel_organization_id: string | null;
  channel_session_id: string | null;
  recipient_kind: TipoDeDestinoDoAvisoDeInstancia;
  recipient: string | null;
  recipient_label: string | null;
  notify_on_down: boolean;
  notify_on_recovered: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface ResultadoDoAvisoDeInstancia {
  status: StatusDaEntregaDoAvisoDeInstancia;
  reason: string | null;
  externalId: string | null;
  recipientMask: string | null;
}

export interface EntradaDeAlertaDeInstancia {
  eventKind: TipoDeEventoDoAvisoDeInstancia;
  affectedOrganizationId?: string | null;
  affectedChannelSessionId?: string | null;
  status?: string | null;
  statusReason?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
  observedAt?: Date;
  requestId?: string;
}

type SessaoRemetente = ChannelSessionRef & {
  id: string;
  organization_id: string;
  provider: string;
  status: string | null;
  archived_at: string | null;
  display_name: string | null;
  phone_number: string | null;
};

export function normalizarDestinoDoAvisoDeInstancia(
  tipo: TipoDeDestinoDoAvisoDeInstancia,
  valor: string,
): string {
  const trimmed = valor.trim();
  if (tipo === "phone") {
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return "";
    return `+${digits}`;
  }
  return trimmed.toLowerCase();
}

export function mascararDestinoDoAvisoDeInstancia(
  destino: string | null | undefined,
  tipo: TipoDeDestinoDoAvisoDeInstancia | null | undefined,
): string | null {
  if (!destino) return null;
  if (tipo === "group") {
    const id = destino.split("@")[0] ?? "";
    return id.length <= 4 ? "grupo ••••" : `grupo ••••${id.slice(-4)}`;
  }

  const digits = destino.replace(/\D/g, "");
  return digits.length <= 4 ? "••••" : `••••${digits.slice(-4)}`;
}

export function destinoDoAvisoEhValido(
  tipo: TipoDeDestinoDoAvisoDeInstancia,
  destino: string,
): boolean {
  if (tipo === "phone") return /^\+[1-9][0-9]{7,14}$/.test(destino);
  return /^[0-9]{6,}@g\.us$/.test(destino);
}

export function motivoLegivelDoAvisoDeInstancia(reason: string | null): string {
  if (!reason) return "Sem detalhe registrado";
  if (reason === "disabled") return "Aviso desligado";
  if (reason === "settings_incomplete") return "Configuração incompleta";
  if (reason === "settings_unreadable") return "Configuração não pôde ser lida";
  if (reason === "event_disabled") return "Evento desativado na configuração";
  if (reason === "sender_missing") return "Conexão de aviso não encontrada";
  if (reason === "sender_archived") return "Conexão de aviso arquivada";
  if (reason === "sender_not_working") return "Conexão de aviso fora do ar";
  if (reason === "sender_not_message_channel") return "Conexão de aviso não envia mensagens";
  if (reason === "sender_no_freeform") return "Conexão de aviso exige modelo aprovado";
  if (reason === "sender_not_configured") return "Transporte da conexão de aviso ausente";
  if (reason === "recipient_invalid") return "Destino inválido";
  if (reason === "recipient_group_unsupported") return "Canal de aviso não envia para grupos";
  if (reason === "recipient_unresolvable") return "Canal não conseguiu resolver o destino";
  if (reason === "pacing:teto_diario") return "Número de aviso atingiu o limite diário";
  if (reason === "pacing:espacamento") return "Número de aviso está aguardando espaçamento";
  if (reason === "send_failed") return "Transporte recusou o envio";
  return reason;
}

export async function carregarConfiguracaoDeAvisoDeInstancia(
  admin: SupabaseClient,
): Promise<ConfiguracaoDeAvisoDeInstancia | null> {
  const { data, error } = await tabelaSemTipos(admin, "platform_instance_alert_settings")
    .select(
      "id, enabled, channel_organization_id, channel_session_id, recipient_kind, recipient, recipient_label, notify_on_down, notify_on_recovered, updated_at, updated_by",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConfiguracaoDeAvisoDeInstancia | null) ?? null;
}

export async function enviarAlertaDeInstancia(
  admin: SupabaseClient,
  entrada: EntradaDeAlertaDeInstancia,
): Promise<ResultadoDoAvisoDeInstancia> {
  const observadoEm = entrada.observedAt ?? new Date();
  let cfg: ConfiguracaoDeAvisoDeInstancia | null = null;

  try {
    cfg = await carregarConfiguracaoDeAvisoDeInstancia(admin);
  } catch (err) {
    logger.warn("[instance-alerts] configuração não pôde ser lida", {
      reason: err instanceof Error ? err.message : "erro",
      requestId: entrada.requestId,
    });
    return { status: "failed", reason: "settings_unreadable", externalId: null, recipientMask: null };
  }

  const recipientMask = mascararDestinoDoAvisoDeInstancia(cfg?.recipient, cfg?.recipient_kind);

  if (!cfg?.enabled) {
    return registrarEntrega(admin, entrada, {
      status: "skipped",
      reason: "disabled",
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg?.channel_organization_id ?? null,
      senderChannelSessionId: cfg?.channel_session_id ?? null,
      recipientKind: cfg?.recipient_kind ?? null,
      observedAt: observadoEm,
      messageBody: null,
    });
  }

  if (
    (entrada.eventKind === "down" && !cfg.notify_on_down) ||
    (entrada.eventKind === "recovered" && !cfg.notify_on_recovered)
  ) {
    return registrarEntrega(admin, entrada, {
      status: "skipped",
      reason: "event_disabled",
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      recipientKind: cfg.recipient_kind,
      observedAt: observadoEm,
      messageBody: null,
    });
  }

  if (!cfg.channel_organization_id || !cfg.channel_session_id || !cfg.recipient) {
    return registrarEntrega(admin, entrada, {
      status: "failed",
      reason: "settings_incomplete",
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      recipientKind: cfg.recipient_kind,
      observedAt: observadoEm,
      messageBody: null,
    });
  }

  if (!destinoDoAvisoEhValido(cfg.recipient_kind, cfg.recipient)) {
    return registrarEntrega(admin, entrada, {
      status: "failed",
      reason: "recipient_invalid",
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      recipientKind: cfg.recipient_kind,
      observedAt: observadoEm,
      messageBody: null,
    });
  }

  const remetente = await carregarSessaoRemetente(
    admin,
    cfg.channel_organization_id,
    cfg.channel_session_id,
  );
  const motivoDoCanal = motivoDeRecusaDoRemetente(remetente);
  if (motivoDoCanal) {
    return registrarEntrega(admin, entrada, {
      status: "failed",
      reason: motivoDoCanal,
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      recipientKind: cfg.recipient_kind,
      observedAt: observadoEm,
      messageBody: null,
    });
  }

  const provider = remetente!.provider as ChannelProvider;
  const caps = capabilitiesOf(provider);
  if (cfg.recipient_kind === "group" && caps.groups !== "full") {
    return registrarEntrega(admin, entrada, {
      status: "failed",
      reason: "recipient_group_unsupported",
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      recipientKind: cfg.recipient_kind,
      observedAt: observadoEm,
      messageBody: null,
    });
  }

  const adapter = getAdapter(provider);
  if (!adapter.isConfigured()) {
    return registrarEntrega(admin, entrada, {
      status: "failed",
      reason: "sender_not_configured",
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      recipientKind: cfg.recipient_kind,
      observedAt: observadoEm,
      messageBody: null,
    });
  }

  const to =
    cfg.recipient_kind === "group"
      ? cfg.recipient
      : adapter.resolveRecipient({
          isGroup: false,
          groupChatId: null,
          phoneNumber: cfg.recipient,
          waIdentity: null,
          waLid: null,
        });
  if (!to) {
    return registrarEntrega(admin, entrada, {
      status: "failed",
      reason: "recipient_unresolvable",
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      recipientKind: cfg.recipient_kind,
      observedAt: observadoEm,
      messageBody: null,
    });
  }

  const pacing = await criarPacingDoCanal(admin);
  const decisao = await pacing.decide(cfg.channel_organization_id, cfg.channel_session_id, observadoEm);
  if (!decisao.liberado) {
    return registrarEntrega(admin, entrada, {
      status: "skipped",
      reason: `pacing:${decisao.motivo}`,
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      recipientKind: cfg.recipient_kind,
      observedAt: observadoEm,
      messageBody: null,
    });
  }

  const body = await montarMensagemDoAvisoDeInstancia(admin, entrada, cfg, observadoEm);

  let externalId: string | null = null;
  try {
    const resposta = await adapter.send({
      organizationId: cfg.channel_organization_id,
      sessionRef: resolveSessionRef(remetente!),
      to,
      kind: "text",
      body,
    });
    externalId = resposta.externalId;
  } catch (err) {
    logger.warn("[instance-alerts] envio recusado pelo canal", {
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      requestId: entrada.requestId,
      reason: err instanceof Error ? err.message.slice(0, 180) : "erro",
    });
    return registrarEntrega(admin, entrada, {
      status: "failed",
      reason: "send_failed",
      externalId: null,
      recipientMask,
      senderOrganizationId: cfg.channel_organization_id,
      senderChannelSessionId: cfg.channel_session_id,
      recipientKind: cfg.recipient_kind,
      observedAt: observadoEm,
      messageBody: body,
    });
  }

  await pacing.registraEnvio(cfg.channel_organization_id, cfg.channel_session_id, observadoEm);
  return registrarEntrega(admin, entrada, {
    status: "sent",
    reason: null,
    externalId,
    recipientMask,
    senderOrganizationId: cfg.channel_organization_id,
    senderChannelSessionId: cfg.channel_session_id,
    recipientKind: cfg.recipient_kind,
    observedAt: observadoEm,
    messageBody: body,
  });
}

function motivoDeRecusaDoRemetente(remetente: SessaoRemetente | null): string | null {
  if (!remetente) return "sender_missing";
  if (remetente.archived_at) return "sender_archived";
  if (!transportaMensagem(remetente.provider)) return "sender_not_message_channel";
  try {
    if (!capabilitiesOf(remetente.provider as ChannelProvider).freeformOutsideWindow) {
      return "sender_no_freeform";
    }
  } catch {
    return "sender_not_message_channel";
  }
  if ((remetente.status ?? "").toUpperCase() !== STATUS_SAUDAVEL) return "sender_not_working";
  return null;
}

async function carregarSessaoRemetente(
  admin: SupabaseClient,
  organizationId: string,
  sessionId: string,
): Promise<SessaoRemetente | null> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select(
      `id, organization_id, status, archived_at, display_name, phone_number, ${CHANNEL_SESSION_REF_COLUMNS}`,
    )
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SessaoRemetente | null) ?? null;
}

async function montarMensagemDoAvisoDeInstancia(
  admin: SupabaseClient,
  entrada: EntradaDeAlertaDeInstancia,
  cfg: ConfiguracaoDeAvisoDeInstancia,
  observadoEm: Date,
): Promise<string> {
  if (entrada.eventKind === "test") {
    return [
      "Teste de aviso de instância",
      "",
      "Este número está configurado para enviar avisos quando uma conexão de cliente cair ou voltar.",
      `Destino configurado: ${cfg.recipient_label?.trim() || mascararDestinoDoAvisoDeInstancia(cfg.recipient, cfg.recipient_kind) || "sem rótulo"}`,
      `Horário: ${formatarDataPt(observadoEm)}`,
    ].join("\n");
  }

  const [orgNome, pendentes] = await Promise.all([
    nomeDaOrganizacao(admin, entrada.affectedOrganizationId ?? null),
    contarConversasPendentes(admin, entrada.affectedOrganizationId ?? null, entrada.affectedChannelSessionId ?? null),
  ]);
  const conexao = entrada.displayName || entrada.phoneNumber || entrada.affectedChannelSessionId || "conexão sem nome";
  const titulo =
    entrada.eventKind === "recovered"
      ? "Instância voltou a funcionar"
      : "Instância de atendimento fora do ar";
  const detalhe =
    entrada.eventKind === "recovered"
      ? "O aviso aberto foi marcado como resolvido no CRM."
      : "Nenhuma mensagem entra nem sai por esta conexão enquanto ela estiver assim.";

  return [
    titulo,
    "",
    `Empresa: ${orgNome}`,
    `Conexão: ${conexao}`,
    `Status: ${entrada.status ?? "desconhecido"}`,
    entrada.statusReason ? `Detalhe: ${entrada.statusReason}` : null,
    pendentes > 0 ? `Conversas pendentes há mais de 10 min: ${pendentes}` : "Conversas pendentes há mais de 10 min: 0",
    `Observado em: ${formatarDataPt(observadoEm)}`,
    "",
    detalhe,
  ]
    .filter((linha): linha is string => linha !== null)
    .join("\n");
}

async function nomeDaOrganizacao(admin: SupabaseClient, organizationId: string | null): Promise<string> {
  if (!organizationId) return "Instalação";
  const { data } = await admin
    .from("organizations")
    .select("display_name, legal_name")
    .eq("id", organizationId)
    .maybeSingle();
  const org = data as { display_name?: string | null; legal_name?: string | null } | null;
  return org?.display_name || org?.legal_name || organizationId;
}

async function contarConversasPendentes(
  admin: SupabaseClient,
  organizationId: string | null,
  channelSessionId: string | null,
): Promise<number> {
  if (!organizationId || !channelSessionId) return 0;
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", channelSessionId)
    .eq("status", "pending")
    .lt("last_inbound_at", cutoff);
  if (error) {
    logger.warn("[instance-alerts] contagem de conversas pendentes falhou", {
      organizationId,
      channelSessionId,
      reason: error.message,
    });
    return 0;
  }
  return count ?? 0;
}

async function registrarEntrega(
  admin: SupabaseClient,
  entrada: EntradaDeAlertaDeInstancia,
  registro: {
    status: StatusDaEntregaDoAvisoDeInstancia;
    reason: string | null;
    externalId: string | null;
    recipientMask: string | null;
    senderOrganizationId: string | null;
    senderChannelSessionId: string | null;
    recipientKind: TipoDeDestinoDoAvisoDeInstancia | null;
    observedAt: Date;
    messageBody: string | null;
  },
): Promise<ResultadoDoAvisoDeInstancia> {
  const { error } = await tabelaSemTipos(admin, "platform_instance_alert_deliveries").insert({
    event_kind: entrada.eventKind,
    affected_organization_id: entrada.affectedOrganizationId ?? null,
    affected_channel_session_id: entrada.affectedChannelSessionId ?? null,
    sender_organization_id: registro.senderOrganizationId,
    sender_channel_session_id: registro.senderChannelSessionId,
    recipient_kind: registro.recipientKind,
    recipient_mask: registro.recipientMask,
    status: registro.status,
    reason: registro.reason,
    external_id: registro.externalId,
    message_hash: registro.messageBody
      ? createHash("sha256").update(registro.messageBody).digest("hex")
      : null,
    sent_at: registro.status === "sent" ? registro.observedAt.toISOString() : null,
  } as never);
  if (error) {
    logger.warn("[instance-alerts] histórico do aviso não foi gravado", {
      eventKind: entrada.eventKind,
      status: registro.status,
      reason: error.message,
    });
  }

  return {
    status: registro.status,
    reason: registro.reason,
    externalId: registro.externalId,
    recipientMask: registro.recipientMask,
  };
}

function formatarDataPt(data: Date): string {
  return data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function tabelaSemTipos(admin: SupabaseClient, nome: string) {
  return admin.from(nome as never);
}

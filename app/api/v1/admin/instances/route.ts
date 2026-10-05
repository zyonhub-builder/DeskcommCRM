import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import {
  PROVIDERS_DE_MENSAGEM,
  capabilitiesOf,
  transportaMensagem,
  type ChannelProvider,
} from "@/lib/channels";
import { STATUS_QUE_AVISAM, STATUS_SAUDAVEL } from "@/lib/channels/health";
import {
  destinoDoAvisoEhValido,
  mascararDestinoDoAvisoDeInstancia,
  motivoLegivelDoAvisoDeInstancia,
  normalizarDestinoDoAvisoDeInstancia,
  type ConfiguracaoDeAvisoDeInstancia,
  type StatusDaEntregaDoAvisoDeInstancia,
  type TipoDeDestinoDoAvisoDeInstancia,
  type TipoDeEventoDoAvisoDeInstancia,
} from "@/lib/platform/instance-alerts";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export interface AdminInstanceSettings {
  enabled: boolean;
  channel_organization_id: string | null;
  channel_session_id: string | null;
  recipient_kind: TipoDeDestinoDoAvisoDeInstancia;
  recipient: string | null;
  recipient_mask: string | null;
  recipient_label: string | null;
  notify_on_down: boolean;
  notify_on_recovered: boolean;
  updated_at: string | null;
}

export interface AdminInstanceChannelOption {
  id: string;
  organization_id: string;
  organization_name: string;
  label: string;
  status: string | null;
  phone_number: string | null;
  provider: string | null;
  accepts_freeform: boolean;
}

export interface AdminInstanceRow {
  id: string;
  organization_id: string;
  organization_name: string;
  display_name: string | null;
  phone_number: string | null;
  provider: string | null;
  status: string | null;
  status_reason: string | null;
  last_health_check_at: string | null;
  last_status_change_at: string | null;
  updated_at: string | null;
  pending_conversations_10min: number;
  health: "ok" | "warning" | "critical";
}

export interface AdminInstanceDeliveryRow {
  id: string;
  event_kind: TipoDeEventoDoAvisoDeInstancia;
  status: StatusDaEntregaDoAvisoDeInstancia;
  reason: string | null;
  reason_label: string;
  recipient_mask: string | null;
  affected_organization_id: string | null;
  affected_organization_name: string | null;
  sender_channel_session_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface AdminInstancesPayload {
  settings: AdminInstanceSettings;
  channel_options: AdminInstanceChannelOption[];
  sessions: AdminInstanceRow[];
  deliveries: AdminInstanceDeliveryRow[];
  summary: {
    total_sessions: number;
    working_sessions: number;
    down_sessions: number;
    warning_sessions: number;
    pending_conversations_10min: number;
    alerts_enabled: boolean;
  };
}

const updateSchema = z.object({
  enabled: z.boolean(),
  channel_organization_id: z.string().uuid().nullable(),
  channel_session_id: z.string().uuid().nullable(),
  recipient_kind: z.enum(["phone", "group"]),
  recipient: z.string().max(160).nullable(),
  recipient_label: z.string().max(80).nullable(),
  notify_on_down: z.boolean(),
  notify_on_recovered: z.boolean(),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const admin = createAdminClient();
  let payload: AdminInstancesPayload;
  try {
    payload = await carregarPainelDeInstancias(admin);
  } catch {
    return fail("internal_error", "Não foi possível carregar as instâncias.", 500, {
      requestId,
    });
  }
  return ok(payload, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  let ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    ctx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_error", "Configuração inválida.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;
  const recipient = input.recipient
    ? normalizarDestinoDoAvisoDeInstancia(input.recipient_kind, input.recipient)
    : null;

  if (recipient && !destinoDoAvisoEhValido(input.recipient_kind, recipient)) {
    return fail(
      "validation_error",
      input.recipient_kind === "phone"
        ? "Informe o telefone em formato internacional, com DDI."
        : "Informe o JID do grupo no formato 120363000000000000@g.us.",
      422,
      { requestId },
    );
  }

  if (input.enabled && (!input.channel_organization_id || !input.channel_session_id || !recipient)) {
    return fail(
      "validation_error",
      "Para ligar os avisos, escolha a conexão remetente e o destino.",
      422,
      { requestId },
    );
  }

  const admin = createAdminClient();
  if (input.channel_organization_id && input.channel_session_id) {
    let existe = false;
    try {
      existe = await canalExiste(admin, input.channel_organization_id, input.channel_session_id);
    } catch {
      return fail("internal_error", "Não foi possível conferir a conexão de aviso.", 500, {
        requestId,
      });
    }
    if (!existe) {
      return fail("not_found", "Conexão de aviso não encontrada.", 404, { requestId });
    }
  }

  const { error } = await admin.from("platform_instance_alert_settings" as never).upsert(
    {
      id: 1,
      enabled: input.enabled,
      channel_organization_id: input.channel_organization_id,
      channel_session_id: input.channel_session_id,
      recipient_kind: input.recipient_kind,
      recipient,
      recipient_label: input.recipient_label?.trim() || null,
      notify_on_down: input.notify_on_down,
      notify_on_recovered: input.notify_on_recovered,
      updated_by: ctx.user.id,
    } as never,
    { onConflict: "id" },
  );

  if (error) {
    return fail("internal_error", "Não foi possível salvar a configuração.", 500, {
      requestId,
      details: { code: error.code },
    });
  }

  void audit({
    action: "platform.instance_alert_settings_updated",
    actorUserId: ctx.user.id,
    resourceType: "platform_instance_alert_settings",
    bypassedRls: true,
    metadata: {
      settings_id: 1,
      enabled: input.enabled,
      channel_organization_id: input.channel_organization_id,
      channel_session_id: input.channel_session_id,
      recipient_kind: input.recipient_kind,
      recipient_mask: mascararDestinoDoAvisoDeInstancia(recipient, input.recipient_kind),
      notify_on_down: input.notify_on_down,
      notify_on_recovered: input.notify_on_recovered,
    },
  });

  let payload: AdminInstancesPayload;
  try {
    payload = await carregarPainelDeInstancias(admin);
  } catch {
    return fail("internal_error", "Configuração salva, mas o painel não pôde ser recarregado.", 500, {
      requestId,
    });
  }
  return ok(payload, { requestId });
}

async function carregarPainelDeInstancias(
  admin: ReturnType<typeof createAdminClient>,
): Promise<AdminInstancesPayload> {
  const [settingsRes, sessionsRes, pendentesRes, deliveriesRes] = await Promise.all([
    tabelaSemTipos(admin, "platform_instance_alert_settings")
      .select(
        "id, enabled, channel_organization_id, channel_session_id, recipient_kind, recipient, recipient_label, notify_on_down, notify_on_recovered, updated_at, updated_by",
      )
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("channel_sessions")
      .select(
        "id, organization_id, display_name, phone_number, provider, status, status_reason, last_health_check_at, last_status_change_at, updated_at, archived_at, organizations!channel_sessions_organization_id_fkey(display_name, legal_name)",
      )
      .is("archived_at", null)
      .in("provider", [...PROVIDERS_DE_MENSAGEM])
      .order("updated_at", { ascending: false })
      .limit(1000),
    admin
      .from("conversations")
      .select("organization_id, channel_session_id")
      .eq("status", "pending")
      .lt("last_inbound_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .not("channel_session_id", "is", null)
      .limit(10000),
    tabelaSemTipos(admin, "platform_instance_alert_deliveries")
      .select(
        "id, event_kind, status, reason, recipient_mask, affected_organization_id, sender_channel_session_id, created_at, sent_at, organizations:affected_organization_id(display_name, legal_name)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (pendentesRes.error) throw new Error(pendentesRes.error.message);
  if (deliveriesRes.error) throw new Error(deliveriesRes.error.message);

  const settings = mapSettings((settingsRes.data as ConfiguracaoDeAvisoDeInstancia | null) ?? null);
  const pendingBySession = new Map<string, number>();
  for (const row of (pendentesRes.data ?? []) as Array<{
    organization_id: string;
    channel_session_id: string | null;
  }>) {
    if (!row.channel_session_id) continue;
    const key = `${row.organization_id}:${row.channel_session_id}`;
    pendingBySession.set(key, (pendingBySession.get(key) ?? 0) + 1);
  }

  const sessions = ((sessionsRes.data ?? []) as RawSession[]).map((row) => {
    const status = (row.status ?? "").toUpperCase();
    const pending = pendingBySession.get(`${row.organization_id}:${row.id}`) ?? 0;
    const health: AdminInstanceRow["health"] = (STATUS_QUE_AVISAM as readonly string[]).includes(
      status,
    )
      ? "critical"
      : status === STATUS_SAUDAVEL
        ? "ok"
        : "warning";
    return {
      id: row.id,
      organization_id: row.organization_id,
      organization_name: nomeDaOrg(row.organizations) ?? row.organization_id,
      display_name: row.display_name,
      phone_number: row.phone_number,
      provider: row.provider,
      status: row.status,
      status_reason: row.status_reason,
      last_health_check_at: row.last_health_check_at,
      last_status_change_at: row.last_status_change_at,
      updated_at: row.updated_at,
      pending_conversations_10min: pending,
      health,
    };
  });

  const channelOptions = ((sessionsRes.data ?? []) as RawSession[])
    .map((row) => {
      let acceptsFreeform = false;
      if (transportaMensagem(row.provider)) {
        try {
          acceptsFreeform = capabilitiesOf(row.provider as ChannelProvider).freeformOutsideWindow;
        } catch {
          acceptsFreeform = false;
        }
      }
      return {
        id: row.id,
        organization_id: row.organization_id,
        organization_name: nomeDaOrg(row.organizations) ?? row.organization_id,
        label: row.display_name || row.phone_number || row.id,
        status: row.status,
        phone_number: row.phone_number,
        provider: row.provider,
        accepts_freeform: acceptsFreeform,
      };
    })
    .sort((a, b) => a.organization_name.localeCompare(b.organization_name));

  const deliveries = ((deliveriesRes.data ?? []) as RawDelivery[]).map((row) => ({
    id: row.id,
    event_kind: row.event_kind,
    status: row.status,
    reason: row.reason,
    reason_label: motivoLegivelDoAvisoDeInstancia(row.reason),
    recipient_mask: row.recipient_mask,
    affected_organization_id: row.affected_organization_id,
    affected_organization_name: nomeDaOrg(row.organizations),
    sender_channel_session_id: row.sender_channel_session_id,
    created_at: row.created_at,
    sent_at: row.sent_at,
  }));

  return {
    settings,
    channel_options: channelOptions,
    sessions,
    deliveries,
    summary: {
      total_sessions: sessions.length,
      working_sessions: sessions.filter((s) => (s.status ?? "").toUpperCase() === STATUS_SAUDAVEL)
        .length,
      down_sessions: sessions.filter((s) => s.health === "critical").length,
      warning_sessions: sessions.filter((s) => s.health === "warning").length,
      pending_conversations_10min: sessions.reduce(
        (total, s) => total + s.pending_conversations_10min,
        0,
      ),
      alerts_enabled: settings.enabled,
    },
  };
}

async function canalExiste(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, provider, archived_at")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data && transportaMensagem((data as { provider?: string | null }).provider));
}

function mapSettings(row: ConfiguracaoDeAvisoDeInstancia | null): AdminInstanceSettings {
  return {
    enabled: row?.enabled ?? false,
    channel_organization_id: row?.channel_organization_id ?? null,
    channel_session_id: row?.channel_session_id ?? null,
    recipient_kind: row?.recipient_kind ?? "phone",
    recipient: row?.recipient ?? null,
    recipient_mask: mascararDestinoDoAvisoDeInstancia(row?.recipient, row?.recipient_kind),
    recipient_label: row?.recipient_label ?? null,
    notify_on_down: row?.notify_on_down ?? true,
    notify_on_recovered: row?.notify_on_recovered ?? true,
    updated_at: row?.updated_at ?? null,
  };
}

type OrgJoin = { display_name?: string | null; legal_name?: string | null } | null;

type RawSession = {
  id: string;
  organization_id: string;
  display_name: string | null;
  phone_number: string | null;
  provider: string | null;
  status: string | null;
  status_reason: string | null;
  last_health_check_at: string | null;
  last_status_change_at: string | null;
  updated_at: string | null;
  organizations: OrgJoin | OrgJoin[];
};

type RawDelivery = {
  id: string;
  event_kind: TipoDeEventoDoAvisoDeInstancia;
  status: StatusDaEntregaDoAvisoDeInstancia;
  reason: string | null;
  recipient_mask: string | null;
  affected_organization_id: string | null;
  sender_channel_session_id: string | null;
  created_at: string;
  sent_at: string | null;
  organizations: OrgJoin | OrgJoin[];
};

function nomeDaOrg(org: OrgJoin | OrgJoin[] | undefined): string | null {
  const row = Array.isArray(org) ? org[0] : org;
  return row?.display_name || row?.legal_name || null;
}

function tabelaSemTipos(admin: ReturnType<typeof createAdminClient>, nome: string) {
  return admin.from(nome as never);
}

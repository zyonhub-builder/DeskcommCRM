import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  montarDiagnosticoComercial,
  type AtividadeDiagnosticoRow,
  type CapturaDiagnosticoRow,
  type ConversationDiagnosticoRow,
  type LeadDiagnosticoRow,
  type LlmCallDiagnosticoRow,
  type MessageDiagnosticoRow,
} from "@/lib/metrics/diagnostico-comercial";

export const DIA_MS = 24 * 60 * 60 * 1000;
export const DIAGNOSTICO_COMERCIAL_LIMITE = 20_000;
export const DIAGNOSTICO_COMERCIAL_MAX_DIAS = 90;

export const janelaDiagnosticoComercialSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export function resolveJanelaDiagnosticoComercial(
  input: z.infer<typeof janelaDiagnosticoComercialSchema>,
) {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * DIA_MS);
  const dias = Math.ceil((to.getTime() - from.getTime()) / DIA_MS);
  return { from, to, dias };
}

export function janelaDiagnosticoInvalida(janela: {
  from: Date;
  to: Date;
  dias: number;
}): "ordem" | "limite" | null {
  if (janela.from.getTime() >= janela.to.getTime()) return "ordem";
  if (janela.dias > DIAGNOSTICO_COMERCIAL_MAX_DIAS) return "limite";
  return null;
}

export async function carregarDiagnosticoComercial(input: {
  admin: SupabaseClient;
  organizationId: string;
  fromIso: string;
  toIso: string;
}) {
  const { admin, organizationId, fromIso, toIso } = input;
  const [leadsCriados, leadsFechados, mensagens, conversas, chamadasIa, captacoes, atividades] =
    await Promise.all([
      admin
        .from("crm_leads")
        .select(
          "id, created_at, closed_at, status, source, source_metadata, lost_reason, owner_kind, owner_user_id, owner_agent_id",
        )
        .eq("organization_id", organizationId)
        .gte("created_at", fromIso)
        .lt("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(DIAGNOSTICO_COMERCIAL_LIMITE),
      admin
        .from("crm_leads")
        .select(
          "id, created_at, closed_at, status, source, source_metadata, lost_reason, owner_kind, owner_user_id, owner_agent_id",
        )
        .eq("organization_id", organizationId)
        .not("closed_at", "is", null)
        .gte("closed_at", fromIso)
        .lt("closed_at", toIso)
        .order("closed_at", { ascending: false })
        .limit(DIAGNOSTICO_COMERCIAL_LIMITE),
      admin
        .from("messages")
        .select("conversation_id, direction, sent_via, sent_at")
        .eq("organization_id", organizationId)
        .gte("sent_at", fromIso)
        .lt("sent_at", toIso)
        .order("sent_at", { ascending: true })
        .limit(DIAGNOSTICO_COMERCIAL_LIMITE),
      admin
        .from("conversations")
        .select("id, status, last_handoff_at, awaiting_since, last_message_at")
        .eq("organization_id", organizationId)
        .not("last_message_at", "is", null)
        .gte("last_message_at", fromIso)
        .lt("last_message_at", toIso)
        .order("last_message_at", { ascending: false })
        .limit(DIAGNOSTICO_COMERCIAL_LIMITE),
      admin
        .from("llm_calls")
        .select("purpose, status, cost_cents, latency_ms, input_tokens, output_tokens")
        .eq("organization_id", organizationId)
        .gte("created_at", fromIso)
        .lt("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(DIAGNOSTICO_COMERCIAL_LIMITE),
      admin
        .from("webhook_lead_captures")
        .select("outcome, source_name, origin, lead_id, utm")
        .eq("organization_id", organizationId)
        .gte("received_at", fromIso)
        .lt("received_at", toIso)
        .order("received_at", { ascending: false })
        .limit(DIAGNOSTICO_COMERCIAL_LIMITE),
      admin
        .from("crm_lead_activities")
        .select("actor_kind, type")
        .eq("organization_id", organizationId)
        .gte("performed_at", fromIso)
        .lt("performed_at", toIso)
        .order("performed_at", { ascending: false })
        .limit(DIAGNOSTICO_COMERCIAL_LIMITE),
    ]);

  const erro =
    leadsCriados.error ??
    leadsFechados.error ??
    mensagens.error ??
    conversas.error ??
    chamadasIa.error ??
    captacoes.error ??
    atividades.error;
  if (erro) throw erro;

  const tamanhos = [
    leadsCriados.data?.length ?? 0,
    leadsFechados.data?.length ?? 0,
    mensagens.data?.length ?? 0,
    conversas.data?.length ?? 0,
    chamadasIa.data?.length ?? 0,
    captacoes.data?.length ?? 0,
    atividades.data?.length ?? 0,
  ];

  return montarDiagnosticoComercial({
    janela: {
      from: fromIso,
      to: toIso,
      dias: Math.ceil((new Date(toIso).getTime() - new Date(fromIso).getTime()) / DIA_MS),
    },
    limite: DIAGNOSTICO_COMERCIAL_LIMITE,
    truncado: tamanhos.some((n) => n >= DIAGNOSTICO_COMERCIAL_LIMITE),
    leadsCriados: (leadsCriados.data ?? []) as unknown as LeadDiagnosticoRow[],
    leadsFechados: (leadsFechados.data ?? []) as unknown as LeadDiagnosticoRow[],
    mensagens: (mensagens.data ?? []) as unknown as MessageDiagnosticoRow[],
    conversas: (conversas.data ?? []) as unknown as ConversationDiagnosticoRow[],
    chamadasIa: (chamadasIa.data ?? []) as unknown as LlmCallDiagnosticoRow[],
    captacoes: (captacoes.data ?? []) as unknown as CapturaDiagnosticoRow[],
    atividades: (atividades.data ?? []) as unknown as AtividadeDiagnosticoRow[],
  });
}

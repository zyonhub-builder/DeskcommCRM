import type { SupabaseClient } from "@supabase/supabase-js";

import { dispatchWahaEvent, type SessionStatusRow, type WahaEnvelope } from "@/lib/waha/ingest";

export const COLUNAS_CANAL_DO_LABORATORIO =
  "id,organization_id,waha_session_name,is_warmup_complete,warmup_started_at";

export interface CanalDoLaboratorio {
  id: string;
  organizationId: string;
  sessionName: string | null;
  isWarmupComplete: boolean | null;
  warmupStartedAt: string | null;
}

export function parseCanalDoLaboratorio(row: Record<string, unknown>): CanalDoLaboratorio {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    sessionName: typeof row.waha_session_name === "string" ? row.waha_session_name : null,
    isWarmupComplete:
      typeof row.is_warmup_complete === "boolean" ? row.is_warmup_complete : null,
    warmupStartedAt: typeof row.warmup_started_at === "string" ? row.warmup_started_at : null,
  };
}

function chatIdDoTelefone(phoneNumber: string): string {
  return `${phoneNumber.replace(/^\+/, "")}@c.us`;
}

type DispatchClient = Parameters<typeof dispatchWahaEvent>[0];

export async function despacharMensagemClienteDoLaboratorio(
  client: SupabaseClient,
  canal: CanalDoLaboratorio,
  input: {
    externalId: string;
    phoneNumber: string;
    body: string;
    contactName: string | null;
    now: Date;
    requestId: string;
    runId: string;
    executionMode: "simulated" | "real_whatsapp";
    agentId: string | null;
    stepIndex: number;
  },
): Promise<void> {
  const envelope: WahaEnvelope = {
    event: "message",
    session: canal.sessionName ?? `lab-${canal.id}`,
    payload: {
      id: input.externalId,
      from: chatIdDoTelefone(input.phoneNumber),
      fromMe: false,
      body: input.body,
      type: "chat",
      timestamp: Math.floor(input.now.getTime() / 1000),
      _data: {
        notifyName: input.contactName ?? "Cliente de teste",
        pushName: input.contactName ?? "Cliente de teste",
        deskcommLab: {
          run_id: input.runId,
          execution_mode: input.executionMode,
          agent_id: input.agentId,
          step_index: input.stepIndex,
        },
      },
    },
  };

  const session: SessionStatusRow = {
    id: canal.id,
    organization_id: canal.organizationId,
    waha_session_name: canal.sessionName,
    is_warmup_complete: canal.isWarmupComplete,
    warmup_started_at: canal.warmupStartedAt,
  };

  await dispatchWahaEvent(client as unknown as DispatchClient, session, envelope, input.requestId);
}

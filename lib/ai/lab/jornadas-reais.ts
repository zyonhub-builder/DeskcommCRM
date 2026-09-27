import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { resetarContatoDeTeste } from "@/lib/contacts/resetar-contato-de-teste";
import { dispatchWahaEvent, type SessionStatusRow, type WahaEnvelope } from "@/lib/waha/ingest";

type LinhaGenerica = Record<string, unknown>;
type TabelaGenerica = {
  Row: LinhaGenerica;
  Insert: LinhaGenerica;
  Update: LinhaGenerica;
  Relationships: [];
};
type DatabaseGenerico = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: Record<string, TabelaGenerica>;
    Views: Record<string, TabelaGenerica>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type AnyClient = SupabaseClient<DatabaseGenerico>;

const telefoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{9,14}$/);

export const passoDaJornadaSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  delay_seconds: z.coerce.number().int().min(10).max(86_400).optional(),
  note: z.string().trim().max(240).optional().nullable(),
});

export type PassoDaJornada = z.infer<typeof passoDaJornadaSchema>;

export const cenarioJornadaSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  channel_session_id: z.string().uuid().nullable(),
  phone_number: telefoneSchema,
  contact_name: z.string().trim().max(120).optional().nullable(),
  steps: z.array(passoDaJornadaSchema).min(1).max(60),
  default_delay_seconds: z.coerce.number().int().min(10).max(86_400).default(120),
  observation_seconds: z.coerce.number().int().min(0).max(604_800).default(1800),
  is_active: z.boolean().default(true),
});

export const iniciarRodadaSchema = z.object({
  scenario_id: z.string().uuid(),
  reset_existing_contact: z.boolean().default(false),
});

export interface CenarioDaJornada {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  channel_session_id: string | null;
  phone_number: string;
  contact_name: string | null;
  steps: PassoDaJornada[];
  default_delay_seconds: number;
  observation_seconds: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RodadaDaJornada {
  id: string;
  organization_id: string;
  scenario_id: string | null;
  channel_session_id: string | null;
  contact_id: string | null;
  phone_number: string;
  contact_name: string | null;
  script: PassoDaJornada[];
  status: "queued" | "running" | "observing" | "completed" | "failed" | "cancelled";
  current_step_index: number;
  next_step_at: string | null;
  observation_seconds: number;
  observation_until: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_sent_at: string | null;
  report: RelatorioDaRodada | null;
  report_generated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface CanalDaRodada {
  id: string;
  organization_id: string;
  waha_session_name: string | null;
  is_warmup_complete: boolean | null;
  warmup_started_at: string | null;
  status: string | null;
}

interface LinhaMensagem {
  id: string;
  direction: string;
  body: string | null;
  sent_at: string;
  status: string;
  sent_via: string | null;
  sent_by_user_id: string | null;
}

interface LinhaDocumento {
  id: string;
  name: string;
  status: string;
  signed_at: string | null;
  created_at: string;
}

interface LinhaAgendamento {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  meeting_url: string | null;
  google_event_id: string | null;
  created_at: string;
}

interface LinhaRunIa {
  id: string;
  status: string;
  error_code: string | null;
  started_at: string;
  completed_at: string | null;
  steps_count: number;
}

export interface RelatorioDaRodada {
  generated_at: string;
  duration_seconds: number | null;
  status: RodadaDaJornada["status"];
  counts: {
    customer_messages: number;
    outbound_messages: number;
    ai_runs: number;
    ai_run_errors: number;
    zapsign_documents: number;
    signed_documents: number;
    appointments: number;
    appointments_with_meet: number;
  };
  timing: {
    first_customer_message_at: string | null;
    first_outbound_message_at: string | null;
    first_response_seconds: number | null;
  };
  transcript: Array<{
    id: string;
    at: string;
    actor: "cliente" | "crm";
    body: string | null;
    status: string;
  }>;
  effects: {
    zapsign_documents: LinhaDocumento[];
    appointments: LinhaAgendamento[];
    ai_runs: LinhaRunIa[];
  };
  findings: string[];
}

function anyDb(client: SupabaseClient): AnyClient {
  return client as unknown as AnyClient;
}

function linhas(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function linha(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

function erroCurto(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n", 1)[0]?.slice(0, 300) ?? "erro_desconhecido";
}

function normalizarPassos(valor: unknown): PassoDaJornada[] {
  return z.array(passoDaJornadaSchema).parse(valor);
}

function parseCenario(row: Record<string, unknown>): CenarioDaJornada {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    channel_session_id: typeof row.channel_session_id === "string" ? row.channel_session_id : null,
    phone_number: String(row.phone_number),
    contact_name: typeof row.contact_name === "string" ? row.contact_name : null,
    steps: normalizarPassos(row.steps),
    default_delay_seconds: Number(row.default_delay_seconds ?? 120),
    observation_seconds: Number(row.observation_seconds ?? 1800),
    is_active: row.is_active !== false,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function parseRodada(row: Record<string, unknown>): RodadaDaJornada {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    scenario_id: typeof row.scenario_id === "string" ? row.scenario_id : null,
    channel_session_id: typeof row.channel_session_id === "string" ? row.channel_session_id : null,
    contact_id: typeof row.contact_id === "string" ? row.contact_id : null,
    phone_number: String(row.phone_number),
    contact_name: typeof row.contact_name === "string" ? row.contact_name : null,
    script: normalizarPassos(row.script),
    status: String(row.status) as RodadaDaJornada["status"],
    current_step_index: Number(row.current_step_index ?? 0),
    next_step_at: typeof row.next_step_at === "string" ? row.next_step_at : null,
    observation_seconds: Number(row.observation_seconds ?? 1800),
    observation_until: typeof row.observation_until === "string" ? row.observation_until : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    last_sent_at: typeof row.last_sent_at === "string" ? row.last_sent_at : null,
    report: row.report && typeof row.report === "object" ? (row.report as RelatorioDaRodada) : null,
    report_generated_at:
      typeof row.report_generated_at === "string" ? row.report_generated_at : null,
    last_error: typeof row.last_error === "string" ? row.last_error : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function chatIdDoTelefone(phoneNumber: string): string {
  return `${phoneNumber.replace(/^\+/, "")}@c.us`;
}

function externalIdDaMensagem(runId: string, stepIndex: number): string {
  return `lab_${runId.replace(/-/g, "")}_${stepIndex}`;
}

export function materializarPassosDaRodada(scenario: CenarioDaJornada): PassoDaJornada[] {
  return scenario.steps.map((step) => ({
    ...step,
    delay_seconds: step.delay_seconds ?? scenario.default_delay_seconds,
  }));
}

async function registrarEvento(
  client: AnyClient,
  input: {
    organizationId: string;
    runId: string;
    kind: string;
    stepIndex?: number | null;
    body?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await client.from("ai_lab_run_events").insert({
    organization_id: input.organizationId,
    run_id: input.runId,
    kind: input.kind,
    step_index: input.stepIndex ?? null,
    body: input.body ?? null,
    details: input.details ?? {},
  });
}

export async function listarLaboratorioDeJornadas(
  client: SupabaseClient,
  organizationId: string,
): Promise<{
  scenarios: CenarioDaJornada[];
  runs: RodadaDaJornada[];
  channels: Array<{
    id: string;
    label: string;
    status: string | null;
    phone_number: string | null;
  }>;
}> {
  const db = anyDb(client);
  const [
    { data: scenarios, error: scenariosErr },
    { data: runs, error: runsErr },
    { data: channels, error: channelsErr },
  ] = await Promise.all([
    db
      .from("ai_lab_scenarios")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
    db
      .from("ai_lab_runs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(25),
    db
      .from("channel_sessions")
      .select("id,display_name,status,phone_number,waha_session_name,provider")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (scenariosErr) throw new Error(scenariosErr.message);
  if (runsErr) throw new Error(runsErr.message);
  if (channelsErr) throw new Error(channelsErr.message);

  return {
    scenarios: linhas(scenarios).map(parseCenario),
    runs: linhas(runs).map(parseRodada),
    channels: linhas(channels).map((c) => ({
      id: String(c.id),
      label: rotuloDoCanal(c),
      status: typeof c.status === "string" ? c.status : null,
      phone_number: typeof c.phone_number === "string" ? c.phone_number : null,
    })),
  };
}

function textoDaLinha(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rotuloDoCanal(row: Record<string, unknown>): string {
  const displayName = textoDaLinha(row, "display_name");
  if (displayName) return displayName;

  const provider = textoDaLinha(row, "provider");
  const providerLabel: Record<string, string> = {
    datafy: "Datafy",
    meta_cloud: "WhatsApp Oficial",
    wacalls: "Chamadas WhatsApp",
    waha: "WhatsApp",
    zernio: "Zernio",
    zernio_social: "Zernio Social",
  };
  if (provider && providerLabel[provider]) return providerLabel[provider];

  const sessionName = textoDaLinha(row, "waha_session_name");
  if (sessionName) return sessionName;

  return "Canal sem nome";
}

export async function salvarCenarioDaJornada(
  client: SupabaseClient,
  organizationId: string,
  userId: string,
  input: z.infer<typeof cenarioJornadaSchema>,
): Promise<CenarioDaJornada> {
  const db = anyDb(client);
  const payload = {
    organization_id: organizationId,
    name: input.name,
    description: input.description ?? null,
    channel_session_id: input.channel_session_id,
    phone_number: input.phone_number,
    contact_name: input.contact_name ?? null,
    steps: input.steps,
    default_delay_seconds: input.default_delay_seconds,
    observation_seconds: input.observation_seconds,
    is_active: input.is_active,
    created_by: userId,
  };

  const query = input.id
    ? db
        .from("ai_lab_scenarios")
        .update({ ...payload, organization_id: organizationId })
        .eq("organization_id", organizationId)
        .eq("id", input.id)
        .select("*")
        .maybeSingle()
    : db.from("ai_lab_scenarios").insert(payload).select("*").maybeSingle();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data) throw new Error("cenario_nao_encontrado");
  return parseCenario(linha(data) ?? {});
}

async function contatoPorTelefone(
  client: AnyClient,
  organizationId: string,
  phoneNumber: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone_number", phoneNumber)
    .is("is_merged_into", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = linha(data);
  return typeof row?.id === "string" ? row.id : null;
}

export async function iniciarRodadaDaJornada(
  client: SupabaseClient,
  organizationId: string,
  userId: string,
  input: z.infer<typeof iniciarRodadaSchema>,
): Promise<RodadaDaJornada> {
  const db = anyDb(client);
  const { data: scenarioRow, error: scenarioErr } = await db
    .from("ai_lab_scenarios")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", input.scenario_id)
    .maybeSingle();
  if (scenarioErr) throw new Error(scenarioErr.message);
  if (!scenarioRow) throw new Error("cenario_nao_encontrado");
  const scenario = parseCenario(linha(scenarioRow) ?? {});
  if (!scenario.is_active) throw new Error("cenario_inativo");

  if (input.reset_existing_contact) {
    const contactId = await contatoPorTelefone(db, organizationId, scenario.phone_number);
    if (contactId) {
      const reset = await resetarContatoDeTeste(client, { organizationId, contactId });
      if (!reset.ok) throw new Error(reset.error);
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("ai_lab_runs")
    .insert({
      organization_id: organizationId,
      scenario_id: scenario.id,
      channel_session_id: scenario.channel_session_id,
      phone_number: scenario.phone_number,
      contact_name: scenario.contact_name,
      script: materializarPassosDaRodada(scenario),
      status: "queued",
      current_step_index: 0,
      next_step_at: now,
      observation_seconds: scenario.observation_seconds,
      started_at: now,
      created_by: userId,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("rodada_nao_criada");
  const run = parseRodada(linha(data) ?? {});
  await registrarEvento(db, {
    organizationId,
    runId: run.id,
    kind: "run_started",
    details: {
      scenario_id: scenario.id,
      reset_existing_contact: input.reset_existing_contact,
      steps: scenario.steps.length,
      default_delay_seconds: scenario.default_delay_seconds,
    },
  });
  return run;
}

async function carregarCanalDaRodada(
  client: AnyClient,
  run: RodadaDaJornada,
): Promise<CanalDaRodada> {
  if (!run.channel_session_id) throw new Error("cenario_sem_canal");
  const { data, error } = await client
    .from("channel_sessions")
    .select("id,organization_id,waha_session_name,is_warmup_complete,warmup_started_at,status")
    .eq("organization_id", run.organization_id)
    .eq("id", run.channel_session_id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("canal_nao_encontrado");
  return data as CanalDaRodada;
}

async function marcarRodadaComoFalha(
  client: AnyClient,
  run: RodadaDaJornada,
  error: string,
  stepIndex?: number,
  body?: string,
): Promise<void> {
  await client
    .from("ai_lab_runs")
    .update({ status: "failed", last_error: error, completed_at: new Date().toISOString() })
    .eq("organization_id", run.organization_id)
    .eq("id", run.id);
  await registrarEvento(client, {
    organizationId: run.organization_id,
    runId: run.id,
    kind: stepIndex === undefined ? "run_failed" : "step_failed",
    stepIndex,
    body,
    details: { error },
  });
}

async function iniciarObservacaoOuCompletar(
  client: AnyClient,
  run: RodadaDaJornada,
  now: Date,
): Promise<"observing" | "completed"> {
  if (run.observation_seconds > 0) {
    const observationUntil = new Date(now.getTime() + run.observation_seconds * 1000).toISOString();
    await client
      .from("ai_lab_runs")
      .update({
        status: "observing",
        next_step_at: null,
        observation_until: observationUntil,
      })
      .eq("organization_id", run.organization_id)
      .eq("id", run.id);
    await registrarEvento(client, {
      organizationId: run.organization_id,
      runId: run.id,
      kind: "observing_started",
      details: { observation_until: observationUntil },
    });
    return "observing";
  }

  await concluirRodadaDaJornada(client, run.organization_id, run.id, now);
  return "completed";
}

export async function enviarProximoPassoDaRodada(
  client: SupabaseClient,
  run: RodadaDaJornada,
  now = new Date(),
): Promise<"sent" | "observing" | "completed" | "failed"> {
  const db = anyDb(client);
  const step = run.script[run.current_step_index];
  if (!step) return iniciarObservacaoOuCompletar(db, run, now);

  try {
    const channel = await carregarCanalDaRodada(db, run);
    const externalId = externalIdDaMensagem(run.id, run.current_step_index);
    const envelope: WahaEnvelope = {
      event: "message",
      session: channel.waha_session_name ?? `lab-${channel.id}`,
      payload: {
        id: externalId,
        from: chatIdDoTelefone(run.phone_number),
        fromMe: false,
        body: step.body,
        type: "chat",
        timestamp: Math.floor(now.getTime() / 1000),
        _data: {
          notifyName: run.contact_name ?? "Cliente de teste",
          pushName: run.contact_name ?? "Cliente de teste",
        },
      },
    };

    await dispatchWahaEvent(
      db,
      channel as SessionStatusRow,
      envelope,
      `lab-${run.id}-${run.current_step_index}`,
    );
    const { data: message } = await db
      .from("messages")
      .select("id,contact_id,conversation_id")
      .eq("organization_id", run.organization_id)
      .eq("external_id", externalId)
      .maybeSingle();
    const messageRow = linha(message);

    const sentAt = now.toISOString();
    const nextIndex = run.current_step_index + 1;
    const nextStep = run.script[nextIndex];
    const patch: Record<string, unknown> = {
      status: nextStep ? "running" : run.observation_seconds > 0 ? "observing" : "completed",
      current_step_index: nextIndex,
      last_sent_at: sentAt,
      next_step_at: nextStep
        ? new Date(now.getTime() + (step.delay_seconds ?? 120) * 1000).toISOString()
        : null,
      contact_id:
        typeof messageRow?.contact_id === "string" ? messageRow.contact_id : run.contact_id,
    };

    if (!nextStep && run.observation_seconds > 0) {
      patch.observation_until = new Date(
        now.getTime() + run.observation_seconds * 1000,
      ).toISOString();
    }
    if (!nextStep && run.observation_seconds === 0) {
      patch.completed_at = sentAt;
    }

    await db
      .from("ai_lab_runs")
      .update(patch)
      .eq("organization_id", run.organization_id)
      .eq("id", run.id);
    await registrarEvento(db, {
      organizationId: run.organization_id,
      runId: run.id,
      kind: "customer_message_sent",
      stepIndex: run.current_step_index,
      body: step.body,
      details: {
        external_id: externalId,
        message_id: typeof messageRow?.id === "string" ? messageRow.id : null,
        contact_id: typeof messageRow?.contact_id === "string" ? messageRow.contact_id : null,
        conversation_id:
          typeof messageRow?.conversation_id === "string" ? messageRow.conversation_id : null,
        next_step_at: patch.next_step_at ?? null,
      },
    });

    if (!nextStep && run.observation_seconds === 0) {
      await concluirRodadaDaJornada(client, run.organization_id, run.id, now);
      return "completed";
    }
    if (!nextStep) {
      await registrarEvento(db, {
        organizationId: run.organization_id,
        runId: run.id,
        kind: "observing_started",
        details: { observation_until: patch.observation_until ?? null },
      });
      return "observing";
    }
    return "sent";
  } catch (err) {
    await marcarRodadaComoFalha(db, run, erroCurto(err), run.current_step_index, step.body);
    return "failed";
  }
}

function secondsBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff / 1000)) : null;
}

function findingsDoRelatorio(input: {
  messages: LinhaMensagem[];
  docs: LinhaDocumento[];
  appointments: LinhaAgendamento[];
  aiRuns: LinhaRunIa[];
}): string[] {
  const findings: string[] = [];
  const inbound = input.messages.filter((m) => m.direction === "inbound");
  const outbound = input.messages.filter((m) => m.direction === "outbound");
  if (inbound.length === 0)
    findings.push("Nenhuma mensagem de cliente foi registrada pelo ingest.");
  if (outbound.length === 0)
    findings.push("A IA ou a equipe não respondeu durante a janela observada.");
  if (input.aiRuns.some((r) => r.status !== "completed")) {
    findings.push("Houve execução de IA com falha ou incompleta; abra Execuções para ver o erro.");
  }
  if (input.docs.length === 0)
    findings.push("Nenhum contrato ZapSign foi gerado durante a rodada.");
  if (input.docs.length > 0 && !input.docs.some((d) => d.signed_at)) {
    findings.push("Contrato gerado, mas assinatura não foi detectada na janela observada.");
  }
  if (input.docs.some((d) => d.signed_at) && input.appointments.length === 0) {
    findings.push("Assinatura detectada, mas nenhum agendamento foi criado.");
  }
  if (input.appointments.length > 0 && !input.appointments.some((a) => a.meeting_url)) {
    findings.push("Agendamento criado, mas o link do Meet ainda não ficou disponível.");
  }
  if (findings.length === 0) {
    findings.push("A jornada observada fechou sem falhas automáticas evidentes.");
  }
  return findings;
}

export async function gerarRelatorioDaRodada(
  client: SupabaseClient,
  run: RodadaDaJornada,
  now = new Date(),
): Promise<RelatorioDaRodada> {
  const db = anyDb(client);
  let contactId = run.contact_id;
  if (!contactId) contactId = await contatoPorTelefone(db, run.organization_id, run.phone_number);
  const since = run.started_at ?? run.created_at;

  const [messagesResult, leadsResult, aiRunsResult, appointmentsResult] = contactId
    ? await Promise.all([
        db
          .from("messages")
          .select("id,direction,body,sent_at,status,sent_via,sent_by_user_id")
          .eq("organization_id", run.organization_id)
          .eq("contact_id", contactId)
          .gte("sent_at", since)
          .order("sent_at", { ascending: true })
          .limit(200),
        db
          .from("crm_leads")
          .select("id")
          .eq("organization_id", run.organization_id)
          .eq("contact_id", contactId),
        db
          .from("ai_agent_runs")
          .select("id,status,error_code,started_at,completed_at,steps_count")
          .eq("organization_id", run.organization_id)
          .eq("contact_id", contactId)
          .gte("started_at", since)
          .order("started_at", { ascending: true })
          .limit(80),
        db
          .from("calendar_appointments")
          .select("id,title,status,starts_at,meeting_url,google_event_id,created_at")
          .eq("organization_id", run.organization_id)
          .eq("contact_id", contactId)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(40),
      ])
    : [null, null, null, null];

  const messages = ((messagesResult?.data ?? []) as LinhaMensagem[]).sort((a, b) =>
    a.sent_at.localeCompare(b.sent_at),
  );
  const leadIds = ((leadsResult?.data ?? []) as Array<{ id: string }>).map((l) => l.id);
  const docsByContact = contactId
    ? await db
        .from("zapsign_documents")
        .select("id,name,status,signed_at,created_at")
        .eq("organization_id", run.organization_id)
        .eq("contact_id", contactId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(40)
    : { data: [] };
  const docsByLead =
    leadIds.length > 0
      ? await db
          .from("zapsign_documents")
          .select("id,name,status,signed_at,created_at")
          .eq("organization_id", run.organization_id)
          .in("lead_id", leadIds)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(40)
      : { data: [] };

  const docs = [
    ...((docsByContact.data ?? []) as LinhaDocumento[]),
    ...((docsByLead.data ?? []) as LinhaDocumento[]),
  ].filter((doc, index, all) => all.findIndex((d) => d.id === doc.id) === index);
  const appointments = ((appointmentsResult?.data ?? []) as LinhaAgendamento[]).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const aiRuns = ((aiRunsResult?.data ?? []) as LinhaRunIa[]).sort((a, b) =>
    a.started_at.localeCompare(b.started_at),
  );
  const firstInbound = messages.find((m) => m.direction === "inbound")?.sent_at ?? null;
  const firstOutbound = messages.find((m) => m.direction === "outbound")?.sent_at ?? null;

  return {
    generated_at: now.toISOString(),
    duration_seconds: secondsBetween(run.started_at ?? run.created_at, now.toISOString()),
    status: run.status,
    counts: {
      customer_messages: messages.filter((m) => m.direction === "inbound").length,
      outbound_messages: messages.filter((m) => m.direction === "outbound").length,
      ai_runs: aiRuns.length,
      ai_run_errors: aiRuns.filter((r) => r.status !== "completed").length,
      zapsign_documents: docs.length,
      signed_documents: docs.filter((d) => d.signed_at).length,
      appointments: appointments.length,
      appointments_with_meet: appointments.filter((a) => a.meeting_url).length,
    },
    timing: {
      first_customer_message_at: firstInbound,
      first_outbound_message_at: firstOutbound,
      first_response_seconds: secondsBetween(firstInbound, firstOutbound),
    },
    transcript: messages.map((m) => ({
      id: m.id,
      at: m.sent_at,
      actor: m.direction === "inbound" ? "cliente" : "crm",
      body: m.body,
      status: m.status,
    })),
    effects: {
      zapsign_documents: docs,
      appointments,
      ai_runs: aiRuns,
    },
    findings: findingsDoRelatorio({ messages, docs, appointments, aiRuns }),
  };
}

export async function concluirRodadaDaJornada(
  client: SupabaseClient,
  organizationId: string,
  runId: string,
  now = new Date(),
): Promise<RodadaDaJornada> {
  const db = anyDb(client);
  const { data, error } = await db
    .from("ai_lab_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("rodada_nao_encontrada");
  const run = parseRodada(linha(data) ?? {});
  const report = await gerarRelatorioDaRodada(client, run, now);
  const completedAt = now.toISOString();
  const { data: updated, error: updateErr } = await db
    .from("ai_lab_runs")
    .update({
      status: "completed",
      completed_at: completedAt,
      report,
      report_generated_at: report.generated_at,
      next_step_at: null,
    })
    .eq("organization_id", organizationId)
    .eq("id", runId)
    .select("*")
    .maybeSingle();
  if (updateErr) throw new Error(updateErr.message);
  if (!updated) throw new Error("rodada_nao_atualizada");
  await registrarEvento(db, {
    organizationId,
    runId,
    kind: "report_generated",
    details: { findings: report.findings.length },
  });
  await registrarEvento(db, {
    organizationId,
    runId,
    kind: "run_completed",
    details: { duration_seconds: report.duration_seconds },
  });
  return parseRodada(linha(updated) ?? {});
}

export async function cancelarRodadaDaJornada(
  client: SupabaseClient,
  organizationId: string,
  runId: string,
): Promise<void> {
  const db = anyDb(client);
  const now = new Date().toISOString();
  const { error } = await db
    .from("ai_lab_runs")
    .update({ status: "cancelled", completed_at: now, next_step_at: null })
    .eq("organization_id", organizationId)
    .eq("id", runId)
    .in("status", ["queued", "running", "observing"]);
  if (error) throw new Error(error.message);
  await registrarEvento(db, { organizationId, runId, kind: "run_cancelled" });
}

export async function executarTickDoLaboratorioDeJornadas(
  client: SupabaseClient,
  opts: { now?: Date; limit?: number } = {},
): Promise<{ sent: number; observing: number; completed: number; failed: number }> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 10;
  const db = anyDb(client);
  const dueIso = now.toISOString();
  const { data: dueRuns, error } = await db
    .from("ai_lab_runs")
    .select("*")
    .in("status", ["queued", "running"])
    .lte("next_step_at", dueIso)
    .order("next_step_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const summary = { sent: 0, observing: 0, completed: 0, failed: 0 };
  for (const row of linhas(dueRuns)) {
    const result = await enviarProximoPassoDaRodada(client, parseRodada(row), now);
    if (result === "sent") summary.sent += 1;
    if (result === "observing") summary.observing += 1;
    if (result === "completed") summary.completed += 1;
    if (result === "failed") summary.failed += 1;
  }

  const { data: observingRows, error: observingErr } = await db
    .from("ai_lab_runs")
    .select("*")
    .eq("status", "observing")
    .not("observation_until", "is", null)
    .lte("observation_until", dueIso)
    .order("observation_until", { ascending: true })
    .limit(limit);
  if (observingErr) throw new Error(observingErr.message);

  for (const row of (observingRows ?? []) as Record<string, unknown>[]) {
    try {
      const run = parseRodada(row);
      await concluirRodadaDaJornada(client, run.organization_id, run.id, now);
      summary.completed += 1;
    } catch (err) {
      const organizationId = typeof row.organization_id === "string" ? row.organization_id : "";
      if (organizationId) {
        await marcarRodadaComoFalha(db, parseRodada(row), erroCurto(err));
      }
      summary.failed += 1;
      if (!organizationId) throw err;
    }
  }

  return summary;
}

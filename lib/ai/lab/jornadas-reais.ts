import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { z } from "zod";

import { DEFAULT_CLASSIFIER_MODEL, gatewayConfig, gatewayHeaders } from "@/lib/ai/gateway";
import { resolverModeloDoPonto } from "@/lib/ai/gateway-binding";
import { resetarContatoDeTeste } from "@/lib/contacts/resetar-contato-de-teste";
import { dispatchWahaEvent, type SessionStatusRow, type WahaEnvelope } from "@/lib/waha/ingest";
import { ZAPSIGN_DOCUMENT_ENTITY_KIND, ZAPSIGN_DOCUMENT_SIGNED_EVENT } from "@/lib/zapsign/events";
import { ZAPSIGN_PROVIDER } from "@/lib/zapsign/service";

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

export const AI_LAB_ANALYSIS_PURPOSE = "ai_lab_analysis";
export const AI_LAB_SCENARIO_GENERATION_PURPOSE = "ai_lab_scenario_generation";

const modoExecucaoSchema = z.enum(["simulated", "real_whatsapp"]).default("simulated");
const eventosEsperadosSchema = z
  .object({
    sign_contract: z.boolean().default(true),
    create_calendar_event: z.boolean().default(true),
  })
  .catchall(z.unknown())
  .default({ sign_contract: true, create_calendar_event: true });

export type ModoExecucaoLaboratorio = z.infer<typeof modoExecucaoSchema>;
export type EventosEsperadosLaboratorio = z.infer<typeof eventosEsperadosSchema>;

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
  agent_id: z.string().uuid().optional().nullable(),
  execution_mode: modoExecucaoSchema,
  expected_events: eventosEsperadosSchema,
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

export const gerarRoteiroJornadaSchema = z.object({
  agent_id: z.string().uuid().optional().nullable(),
  name: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  expected_events: eventosEsperadosSchema,
  message_count: z.coerce.number().int().min(4).max(30).default(14),
  default_delay_seconds: z.coerce.number().int().min(10).max(3600).default(120),
});

export interface CenarioDaJornada {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  channel_session_id: string | null;
  agent_id: string | null;
  execution_mode: ModoExecucaoLaboratorio;
  expected_events: EventosEsperadosLaboratorio;
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
  agent_id: string | null;
  execution_mode: ModoExecucaoLaboratorio;
  expected_events: EventosEsperadosLaboratorio;
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

export interface AgenteDoLaboratorio {
  id: string;
  name: string;
  is_active: boolean;
  paused_at: string | null;
  published_version_id: string | null;
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
  execution_mode: ModoExecucaoLaboratorio;
  expected_events: EventosEsperadosLaboratorio;
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
  ai_analysis?: AnaliseIaDaRodada | null;
}

export interface AnaliseIaDaRodada {
  generated_at: string;
  model_id: string;
  model_origin: string;
  summary: string;
  gaps: string[];
  improvements: string[];
  faqs: string[];
  risks: string[];
  next_tests: string[];
}

export interface RoteiroGeradoDaJornada {
  generated_at: string;
  model_id: string;
  model_origin: string;
  steps: PassoDaJornada[];
  notes: string[];
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

function objeto(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

function erroCurto(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n", 1)[0]?.slice(0, 300) ?? "erro_desconhecido";
}

function normalizarPassos(valor: unknown): PassoDaJornada[] {
  return z.array(passoDaJornadaSchema).parse(valor);
}

function normalizarModoExecucao(valor: unknown): ModoExecucaoLaboratorio {
  const parsed = modoExecucaoSchema.safeParse(valor);
  return parsed.success ? parsed.data : "simulated";
}

function normalizarEventosEsperados(valor: unknown): EventosEsperadosLaboratorio {
  const parsed = eventosEsperadosSchema.safeParse(valor);
  return parsed.success ? parsed.data : { sign_contract: true, create_calendar_event: true };
}

function parseCenario(row: Record<string, unknown>): CenarioDaJornada {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    channel_session_id: typeof row.channel_session_id === "string" ? row.channel_session_id : null,
    agent_id: typeof row.agent_id === "string" ? row.agent_id : null,
    execution_mode: normalizarModoExecucao(row.execution_mode),
    expected_events: normalizarEventosEsperados(row.expected_events),
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
    agent_id: typeof row.agent_id === "string" ? row.agent_id : null,
    execution_mode: normalizarModoExecucao(row.execution_mode),
    expected_events: normalizarEventosEsperados(row.expected_events),
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

function parseAgente(row: Record<string, unknown>): AgenteDoLaboratorio {
  return {
    id: String(row.id),
    name: String(row.name),
    is_active: row.is_active !== false,
    paused_at: typeof row.paused_at === "string" ? row.paused_at : null,
    published_version_id:
      typeof row.published_version_id === "string" ? row.published_version_id : null,
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
  agents: AgenteDoLaboratorio[];
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
    { data: agents, error: agentsErr },
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
    db
      .from("ai_agents")
      .select("id,name,is_active,paused_at,published_version_id")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .not("published_version_id", "is", null)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (scenariosErr) throw new Error(scenariosErr.message);
  if (runsErr) throw new Error(runsErr.message);
  if (channelsErr) throw new Error(channelsErr.message);
  if (agentsErr) throw new Error(agentsErr.message);

  return {
    scenarios: linhas(scenarios).map(parseCenario),
    runs: linhas(runs).map(parseRodada),
    agents: linhas(agents).map(parseAgente),
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
    agent_id: input.agent_id ?? null,
    execution_mode: input.execution_mode,
    expected_events: input.expected_events,
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
      agent_id: scenario.agent_id,
      execution_mode: scenario.execution_mode,
      expected_events: scenario.expected_events,
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
      agent_id: scenario.agent_id,
      execution_mode: scenario.execution_mode,
      expected_events: scenario.expected_events,
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
          deskcommLab: {
            run_id: run.id,
            execution_mode: run.execution_mode,
            agent_id: run.agent_id,
            step_index: run.current_step_index,
          },
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
  run: RodadaDaJornada;
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
  if (
    input.run.expected_events.create_calendar_event &&
    input.docs.some((d) => d.signed_at) &&
    input.appointments.length === 0
  ) {
    findings.push(
      "A bateria esperava reunião pós-contrato, mas nenhum evento de agenda foi criado.",
    );
  }
  if (
    input.run.expected_events.sign_contract &&
    input.docs.length > 0 &&
    !input.docs.some((d) => d.signed_at)
  ) {
    findings.push(
      "A bateria esperava assinatura de contrato, mas nenhum documento ficou assinado.",
    );
  }
  if (findings.length === 0) {
    findings.push("A jornada observada fechou sem falhas automáticas evidentes.");
  }
  return findings;
}

async function leadIdsDoContato(
  client: AnyClient,
  organizationId: string,
  contactId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("crm_leads")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((lead) => lead.id);
}

async function simularAssinaturasPendentesDaRodada(
  client: AnyClient,
  run: RodadaDaJornada,
  now = new Date(),
): Promise<number> {
  if (run.execution_mode !== "simulated") return 0;
  if (run.expected_events.sign_contract === false) return 0;

  let contactId = run.contact_id;
  if (!contactId)
    contactId = await contatoPorTelefone(client, run.organization_id, run.phone_number);
  if (!contactId) return 0;

  const since = run.started_at ?? run.created_at;
  const leadIds = await leadIdsDoContato(client, run.organization_id, contactId);
  let query = client
    .from("zapsign_documents")
    .select("id,external_token,lead_id,contact_id,status,signed_at,created_at,provider_payload")
    .eq("organization_id", run.organization_id)
    .gte("created_at", since)
    .is("signed_at", null)
    .neq("status", "signed")
    .limit(10);

  if (leadIds.length > 0) {
    query = query.or(`contact_id.eq.${contactId},lead_id.in.(${leadIds.join(",")})`);
  } else {
    query = query.eq("contact_id", contactId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const docs = linhas(data);
  let signed = 0;
  for (const doc of docs) {
    const documentId = typeof doc.id === "string" ? doc.id : null;
    const token = typeof doc.external_token === "string" ? doc.external_token : null;
    if (!documentId) continue;
    const providerPayload = objeto(doc.provider_payload);

    const signedAt = now.toISOString();
    const { data: updated, error: updateErr } = await client
      .from("zapsign_documents")
      .update({
        status: "signed",
        signed_at: signedAt,
        last_event_type: "doc_signed",
        last_event_at: signedAt,
        provider_payload: {
          ...providerPayload,
          ai_lab_simulation: {
            run_id: run.id,
            signed_at: signedAt,
          },
        },
      })
      .eq("organization_id", run.organization_id)
      .eq("id", documentId)
      .is("signed_at", null)
      .select("id,external_token,lead_id,contact_id,status")
      .maybeSingle();
    if (updateErr) throw new Error(updateErr.message);
    const row = linha(updated);
    if (!row) continue;

    const { error: eventError } = await client.rpc(
      "emit_event" as never,
      {
        p_event_type: ZAPSIGN_DOCUMENT_SIGNED_EVENT,
        p_entity_kind: ZAPSIGN_DOCUMENT_ENTITY_KIND,
        p_entity_id: documentId,
        p_payload: {
          document_id: documentId,
          document_token: typeof row.external_token === "string" ? row.external_token : token,
          lead_id: typeof row.lead_id === "string" ? row.lead_id : null,
          contact_id: typeof row.contact_id === "string" ? row.contact_id : contactId,
          status: "signed",
          provider_event_type: "doc_signed",
        },
        p_metadata: {
          provider: ZAPSIGN_PROVIDER,
          external_id: `ai_lab:${run.id}:${documentId}`,
          simulated: true,
        },
        p_organization_id: run.organization_id,
      } as never,
    );
    if (eventError) throw new Error(eventError.message);
    await registrarEvento(client, {
      organizationId: run.organization_id,
      runId: run.id,
      kind: "zapsign_signed_simulated",
      details: { document_id: documentId, contact_id: contactId },
    });
    signed += 1;
  }
  return signed;
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
    execution_mode: run.execution_mode,
    expected_events: run.expected_events,
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
    findings: findingsDoRelatorio({ run, messages, docs, appointments, aiRuns }),
  };
}

function arrayDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function objetoJsonDaResposta(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("analise_ia_json_invalido");
  }
}

function parseAnaliseIaDaRodada(
  text: string,
  resolved: { modelId: string; origem: string },
  now: Date,
): AnaliseIaDaRodada {
  const json = objetoJsonDaResposta(text);
  return {
    generated_at: now.toISOString(),
    model_id: resolved.modelId,
    model_origin: resolved.origem,
    summary: typeof json.summary === "string" ? json.summary.slice(0, 2000) : "",
    gaps: arrayDeTextos(json.gaps).slice(0, 12),
    improvements: arrayDeTextos(json.improvements).slice(0, 12),
    faqs: arrayDeTextos(json.faqs).slice(0, 12),
    risks: arrayDeTextos(json.risks).slice(0, 12),
    next_tests: arrayDeTextos(json.next_tests).slice(0, 12),
  };
}

async function contextoDoAgenteParaGeracao(
  client: SupabaseClient,
  organizationId: string,
  agentId: string | null | undefined,
): Promise<{ name: string | null; description: string | null; system_prompt: string | null }> {
  if (!agentId) return { name: null, description: null, system_prompt: null };
  const db = anyDb(client);
  const { data, error } = await db
    .from("ai_agents")
    .select("id, name, description, system_prompt, published_version_id")
    .eq("organization_id", organizationId)
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = linha(data);
  if (!row) return { name: null, description: null, system_prompt: null };

  let systemPrompt = typeof row.system_prompt === "string" ? row.system_prompt : null;
  if (typeof row.published_version_id === "string") {
    const { data: version, error: versionErr } = await db
      .from("ai_agent_versions")
      .select("system_prompt")
      .eq("organization_id", organizationId)
      .eq("id", row.published_version_id)
      .maybeSingle();
    if (versionErr) throw new Error(versionErr.message);
    const versionRow = linha(version);
    if (typeof versionRow?.system_prompt === "string") systemPrompt = versionRow.system_prompt;
  }

  return {
    name: typeof row.name === "string" ? row.name : null,
    description: typeof row.description === "string" ? row.description : null,
    system_prompt: systemPrompt,
  };
}

function promptDaGeracaoDeRoteiro(
  input: z.infer<typeof gerarRoteiroJornadaSchema>,
  agent: { name: string | null; description: string | null; system_prompt: string | null },
): string {
  return [
    "Crie uma bateria de teste para simular um cliente conversando com um agente jurídico no WhatsApp.",
    "Devolva APENAS JSON válido. Não escreva comentários fora do JSON.",
    "",
    "Formato obrigatório:",
    '{"steps":[{"body":"mensagem que o cliente envia","delay_seconds":120,"note":"objetivo dessa mensagem"}],"notes":["observação curta"]}',
    "",
    "Regras:",
    "- Gere somente mensagens do cliente. Nunca inclua respostas da IA, atendente ou CRM.",
    "- Use dados fictícios, mas completos o bastante para acionar contrato e agenda quando solicitado.",
    "- Faça a conversa parecer natural, com uma etapa por mensagem e sem textos longos demais.",
    "- Cubra objeções leves, pedido de link do contrato pelo chat e confirmação de agenda quando fizer sentido.",
    "- Não use dados reais sensíveis; CPFs, RGs, e-mails e endereços devem ser claramente fictícios.",
    "",
    `Quantidade alvo de mensagens: ${input.message_count}`,
    `Atraso padrão sugerido: ${input.default_delay_seconds}s`,
    `Cenário: ${input.name || "sem nome informado"}`,
    `Descrição/objetivo: ${input.description || "gerar caminho feliz com pontos de validação"}`,
    `Esperar assinatura de contrato: ${input.expected_events.sign_contract ? "sim" : "não"}`,
    `Esperar agendamento: ${input.expected_events.create_calendar_event ? "sim" : "não"}`,
    "",
    "Agente selecionado:",
    `Nome: ${agent.name || "não informado"}`,
    `Descrição: ${agent.description || "não informada"}`,
    "Prompt publicado/fonte do agente, para alinhar o teste:",
    (agent.system_prompt || "não informado").slice(0, 6000),
  ].join("\n");
}

function parseRoteiroGeradoDaJornada(
  text: string,
  resolved: { modelId: string; origem: string },
  now: Date,
): RoteiroGeradoDaJornada {
  const json = objetoJsonDaResposta(text);
  const rawSteps = Array.isArray(json.steps)
    ? json.steps
    : Array.isArray(json.messages)
      ? json.messages
      : [];
  const parsed = z.array(passoDaJornadaSchema).min(1).max(60).safeParse(rawSteps);
  if (!parsed.success) throw new Error("roteiro_ia_json_invalido");
  return {
    generated_at: now.toISOString(),
    model_id: resolved.modelId,
    model_origin: resolved.origem,
    steps: parsed.data,
    notes: arrayDeTextos(json.notes).slice(0, 8),
  };
}

export async function gerarRoteiroDaJornadaComIa(
  client: SupabaseClient,
  organizationId: string,
  inputRaw: z.infer<typeof gerarRoteiroJornadaSchema>,
  now = new Date(),
): Promise<RoteiroGeradoDaJornada> {
  const input = gerarRoteiroJornadaSchema.parse(inputRaw);
  const resolved = await resolverModeloDoPonto(
    AI_LAB_SCENARIO_GENERATION_PURPOSE,
    organizationId,
    DEFAULT_CLASSIFIER_MODEL,
    { naFaltaUsarOPadraoDaOrganizacao: true },
  );
  if (!resolved) throw new Error("provedor_ia_indisponivel");

  const agent = await contextoDoAgenteParaGeracao(client, organizationId, input.agent_id);
  const cfg = gatewayConfig();
  const generated = await generateText({
    model: resolved.model,
    system:
      "Você cria baterias de teste realistas para QA de atendimento jurídico por WhatsApp. Seja concreto, natural e seguro.",
    prompt: promptDaGeracaoDeRoteiro(input, agent),
    temperature: 0.45,
    maxOutputTokens: 2400,
    maxRetries: 1,
    headers: cfg ? gatewayHeaders({ organizationId }) : undefined,
  });

  const roteiro = parseRoteiroGeradoDaJornada(generated.text, resolved, now);
  return {
    ...roteiro,
    steps: roteiro.steps.slice(0, input.message_count),
  };
}

function promptDaAnaliseIa(run: RodadaDaJornada, report: RelatorioDaRodada): string {
  const transcript = report.transcript
    .slice(-80)
    .map((message) => `${message.actor.toUpperCase()} [${message.at}]: ${message.body ?? ""}`)
    .join("\n");
  const efeitos = {
    counts: report.counts,
    timing: report.timing,
    findings: report.findings,
    expected_events: report.expected_events,
    zapsign_documents: report.effects.zapsign_documents.map((doc) => ({
      status: doc.status,
      signed_at: doc.signed_at,
      created_at: doc.created_at,
    })),
    appointments: report.effects.appointments.map((appointment) => ({
      status: appointment.status,
      starts_at: appointment.starts_at,
      has_meet: Boolean(appointment.meeting_url),
      has_google_event: Boolean(appointment.google_event_id),
    })),
    ai_runs: report.effects.ai_runs.map((aiRun) => ({
      status: aiRun.status,
      error_code: aiRun.error_code,
      steps_count: aiRun.steps_count,
    })),
  };
  return [
    "Analise esta rodada de laboratório de atendimento jurídico e devolva APENAS JSON válido.",
    "O objetivo é apontar gaps de atendimento, melhorias de prompt/processo, FAQs e próximos testes.",
    "",
    "Formato obrigatório:",
    '{"summary":"...","gaps":["..."],"improvements":["..."],"faqs":["..."],"risks":["..."],"next_tests":["..."]}',
    "",
    `Rodada: ${run.id}`,
    `Modo: ${run.execution_mode}`,
    `Telefone: ${run.phone_number}`,
    "",
    "Efeitos observados:",
    JSON.stringify(efeitos, null, 2),
    "",
    "Transcrição:",
    transcript,
  ].join("\n");
}

export async function gerarAnaliseIaDaRodada(
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
  const report = run.report ?? (await gerarRelatorioDaRodada(client, run, now));
  if (report.transcript.length === 0) throw new Error("relatorio_sem_transcricao");

  const resolved = await resolverModeloDoPonto(
    AI_LAB_ANALYSIS_PURPOSE,
    organizationId,
    DEFAULT_CLASSIFIER_MODEL,
    { naFaltaUsarOPadraoDaOrganizacao: true },
  );
  if (!resolved) throw new Error("provedor_ia_indisponivel");

  const cfg = gatewayConfig();
  const generated = await generateText({
    model: resolved.model,
    system:
      "Você é um analista sênior de atendimento jurídico. Seja objetivo, prático e não invente fatos fora da transcrição.",
    prompt: promptDaAnaliseIa(run, report),
    temperature: 0.2,
    maxOutputTokens: 2000,
    maxRetries: 1,
    headers: cfg ? gatewayHeaders({ organizationId }) : undefined,
  });
  const aiAnalysis = parseAnaliseIaDaRodada(generated.text, resolved, now);
  const updatedReport: RelatorioDaRodada = { ...report, ai_analysis: aiAnalysis };
  const { data: updated, error: updateErr } = await db
    .from("ai_lab_runs")
    .update({
      report: updatedReport,
      report_generated_at: updatedReport.generated_at,
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
    kind: "analysis_generated",
    details: { model_id: resolved.modelId, model_origin: resolved.origem },
  });
  return parseRodada(linha(updated) ?? {});
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
  if (run.report?.ai_analysis) report.ai_analysis = run.report.ai_analysis;
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
): Promise<{
  sent: number;
  observing: number;
  completed: number;
  failed: number;
  signed_simulated: number;
}> {
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

  const summary = { sent: 0, observing: 0, completed: 0, failed: 0, signed_simulated: 0 };
  for (const row of linhas(dueRuns)) {
    const result = await enviarProximoPassoDaRodada(client, parseRodada(row), now);
    if (result === "sent") summary.sent += 1;
    if (result === "observing") summary.observing += 1;
    if (result === "completed") summary.completed += 1;
    if (result === "failed") summary.failed += 1;
  }

  const { data: activeRows, error: activeErr } = await db
    .from("ai_lab_runs")
    .select("*")
    .eq("execution_mode", "simulated")
    .in("status", ["running", "observing"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (activeErr) throw new Error(activeErr.message);

  for (const row of linhas(activeRows)) {
    try {
      summary.signed_simulated += await simularAssinaturasPendentesDaRodada(
        db,
        parseRodada(row),
        now,
      );
    } catch (err) {
      await marcarRodadaComoFalha(db, parseRodada(row), erroCurto(err));
      summary.failed += 1;
    }
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

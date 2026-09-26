import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { tokenForConnection } from "@/lib/agenda/google/sync-executor";

export type ResetContatoDeTesteCountKey =
  | "zapsign_documents"
  | "ai_agent_runs"
  | "ai_invocations"
  | "llm_calls"
  | "before_send_traces"
  | "send_ledger"
  | "job_queue"
  | "event_log"
  | "messages"
  | "conversations"
  | "calendar_appointments"
  | "orders"
  | "crm_leads"
  | "contacts"
  | "google_calendar_events_deleted"
  | "google_calendar_events_failed";

export type ContagensDoResetDeContatoDeTeste = Record<ResetContatoDeTesteCountKey, number>;

type TabelaDaFalhaDeReset = ResetContatoDeTesteCountKey | "contacts_read" | "dependencies_read";

export type ResultadoDoResetDeContatoDeTeste =
  | { readonly ok: true; readonly counts: ContagensDoResetDeContatoDeTeste }
  | {
      readonly ok: false;
      readonly error: "not_found" | "db_error";
      readonly tabela?: TabelaDaFalhaDeReset;
      readonly details?: string;
      readonly counts: ContagensDoResetDeContatoDeTeste;
    };

type CompromissoComGoogle = {
  id: string;
  google_connection_id: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
  google_etag: string | null;
};

function contagensZeradas(): ContagensDoResetDeContatoDeTeste {
  return {
    zapsign_documents: 0,
    ai_agent_runs: 0,
    ai_invocations: 0,
    llm_calls: 0,
    before_send_traces: 0,
    send_ledger: 0,
    job_queue: 0,
    event_log: 0,
    messages: 0,
    conversations: 0,
    calendar_appointments: 0,
    orders: 0,
    crm_leads: 0,
    contacts: 0,
    google_calendar_events_deleted: 0,
    google_calendar_events_failed: 0,
  };
}

function idsUnicos(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

function idsDasLinhas(rows: readonly Record<string, unknown>[] | null | undefined): string[] {
  return idsUnicos((rows ?? []).flatMap((row) => (typeof row.id === "string" ? [row.id] : [])));
}

function soma(
  counts: ContagensDoResetDeContatoDeTeste,
  key: ResetContatoDeTesteCountKey,
  n: number,
) {
  counts[key] += n;
}

function falha(
  counts: ContagensDoResetDeContatoDeTeste,
  tabela: TabelaDaFalhaDeReset,
  details: string,
): ResultadoDoResetDeContatoDeTeste {
  return { ok: false, error: "db_error", tabela, details, counts };
}

async function selecionarIdsPorContato(
  client: SupabaseClient,
  tabela: string,
  organizationId: string,
  contactId: string,
): Promise<{ ok: true; ids: string[] } | { ok: false; details: string }> {
  const { data, error } = await client
    .from(tabela)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId);
  if (error) return { ok: false, details: error.message };
  return { ok: true, ids: idsDasLinhas(data as Record<string, unknown>[] | null) };
}

async function selecionarIdsPorValores(
  client: SupabaseClient,
  tabela: string,
  organizationId: string,
  coluna: string,
  valores: readonly string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; details: string }> {
  const lista = idsUnicos([...valores]);
  if (lista.length === 0) return { ok: true, ids: [] };

  const { data, error } = await client
    .from(tabela)
    .select("id")
    .eq("organization_id", organizationId)
    .in(coluna, lista);
  if (error) return { ok: false, details: error.message };
  return { ok: true, ids: idsDasLinhas(data as Record<string, unknown>[] | null) };
}

async function selecionarDocumentosZapsign(
  client: SupabaseClient,
  organizationId: string,
  contactId: string,
  leadIds: readonly string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; details: string }> {
  const porContato = await selecionarIdsPorContato(
    client,
    "zapsign_documents",
    organizationId,
    contactId,
  );
  if (!porContato.ok) return porContato;

  const porLead = await selecionarIdsPorValores(
    client,
    "zapsign_documents",
    organizationId,
    "lead_id",
    leadIds,
  );
  if (!porLead.ok) return porLead;

  return { ok: true, ids: idsUnicos([...porContato.ids, ...porLead.ids]) };
}

async function selecionarMensagens(
  client: SupabaseClient,
  organizationId: string,
  contactId: string,
  conversationIds: readonly string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; details: string }> {
  const porContato = await selecionarIdsPorContato(client, "messages", organizationId, contactId);
  if (!porContato.ok) return porContato;
  if (conversationIds.length === 0) return { ok: true, ids: porContato.ids };

  const { data, error } = await client
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .in("conversation_id", conversationIds);
  if (error) return { ok: false, details: error.message };

  return {
    ok: true,
    ids: idsUnicos([...porContato.ids, ...idsDasLinhas(data as Record<string, unknown>[] | null)]),
  };
}

async function selecionarCompromissos(
  client: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<{ ok: true; rows: CompromissoComGoogle[] } | { ok: false; details: string }> {
  const { data, error } = await client
    .from("calendar_appointments")
    .select("id,google_connection_id,google_calendar_id,google_event_id,google_etag")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId);
  if (error) return { ok: false, details: error.message };
  return { ok: true, rows: (data ?? []) as CompromissoComGoogle[] };
}

async function apagarPorContato(
  client: SupabaseClient,
  counts: ContagensDoResetDeContatoDeTeste,
  key: ResetContatoDeTesteCountKey,
  tabela: string,
  organizationId: string,
  contactId: string,
): Promise<ResultadoDoResetDeContatoDeTeste | null> {
  const { count, error } = await client
    .from(tabela)
    .delete({ count: "exact" })
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId);
  if (error) return falha(counts, key, error.message);
  soma(counts, key, count ?? 0);
  return null;
}

async function apagarPorIds(
  client: SupabaseClient,
  counts: ContagensDoResetDeContatoDeTeste,
  key: ResetContatoDeTesteCountKey,
  tabela: string,
  organizationId: string,
  coluna: string,
  ids: readonly string[],
): Promise<ResultadoDoResetDeContatoDeTeste | null> {
  const lista = idsUnicos([...ids]);
  if (lista.length === 0) return null;
  const { count, error } = await client
    .from(tabela)
    .delete({ count: "exact" })
    .eq("organization_id", organizationId)
    .in(coluna, lista);
  if (error) return falha(counts, key, error.message);
  soma(counts, key, count ?? 0);
  return null;
}

async function apagarEventoGoogle(
  client: SupabaseClient,
  organizationId: string,
  compromisso: CompromissoComGoogle,
): Promise<"deleted" | "skipped" | "failed"> {
  if (
    !compromisso.google_connection_id ||
    !compromisso.google_calendar_id ||
    !compromisso.google_event_id
  ) {
    return "skipped";
  }

  try {
    const token = await tokenForConnection(
      client,
      organizationId,
      compromisso.google_connection_id,
    );
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(compromisso.google_calendar_id)}` +
      `/events/${encodeURIComponent(compromisso.google_event_id)}?sendUpdates=all`;
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (compromisso.google_etag) headers["If-Match"] = compromisso.google_etag;
    const resposta = await fetch(url, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return resposta.status === 204 || resposta.status === 404 || resposta.status === 410
      ? "deleted"
      : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Reset de UM contato de laboratório.
 *
 * O client aqui é service role, então toda leitura/escrita filtra
 * `organization_id` manualmente. A função não apaga configuração da empresa,
 * canal, agente, credencial, funil ou auditoria; ela limpa só o grafo de
 * atendimento que faria o próximo inbound parecer continuação do teste anterior.
 */
export async function resetarContatoDeTeste(
  client: SupabaseClient,
  input: {
    readonly organizationId: string;
    readonly contactId: string;
  },
): Promise<ResultadoDoResetDeContatoDeTeste> {
  const counts = contagensZeradas();

  const { data: contact, error: contactError } = await client
    .from("contacts")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("id", input.contactId)
    .maybeSingle();
  if (contactError) return falha(counts, "contacts_read", contactError.message);
  if (!contact) return { ok: false, error: "not_found", counts };

  const conversas = await selecionarIdsPorContato(
    client,
    "conversations",
    input.organizationId,
    input.contactId,
  );
  if (!conversas.ok) return falha(counts, "dependencies_read", conversas.details);

  const leads = await selecionarIdsPorContato(
    client,
    "crm_leads",
    input.organizationId,
    input.contactId,
  );
  if (!leads.ok) return falha(counts, "dependencies_read", leads.details);

  const zapsignDocumentos = await selecionarDocumentosZapsign(
    client,
    input.organizationId,
    input.contactId,
    leads.ids,
  );
  if (!zapsignDocumentos.ok) {
    return falha(counts, "dependencies_read", zapsignDocumentos.details);
  }

  const jobs = await selecionarIdsPorContato(
    client,
    "job_queue",
    input.organizationId,
    input.contactId,
  );
  if (!jobs.ok) return falha(counts, "dependencies_read", jobs.details);

  const mensagens = await selecionarMensagens(
    client,
    input.organizationId,
    input.contactId,
    conversas.ids,
  );
  if (!mensagens.ok) return falha(counts, "dependencies_read", mensagens.details);

  const compromissos = await selecionarCompromissos(client, input.organizationId, input.contactId);
  if (!compromissos.ok) return falha(counts, "dependencies_read", compromissos.details);

  for (const compromisso of compromissos.rows) {
    const resultado = await apagarEventoGoogle(client, input.organizationId, compromisso);
    if (resultado === "deleted") soma(counts, "google_calendar_events_deleted", 1);
    if (resultado === "failed") soma(counts, "google_calendar_events_failed", 1);
  }

  for (const operacao of [
    () =>
      apagarPorIds(
        client,
        counts,
        "zapsign_documents",
        "zapsign_documents",
        input.organizationId,
        "lead_id",
        leads.ids,
      ),
    () =>
      apagarPorContato(
        client,
        counts,
        "zapsign_documents",
        "zapsign_documents",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorContato(
        client,
        counts,
        "ai_agent_runs",
        "ai_agent_runs",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorIds(
        client,
        counts,
        "ai_agent_runs",
        "ai_agent_runs",
        input.organizationId,
        "conversation_id",
        conversas.ids,
      ),
    () =>
      apagarPorIds(
        client,
        counts,
        "ai_agent_runs",
        "ai_agent_runs",
        input.organizationId,
        "inbound_message_id",
        mensagens.ids,
      ),
    () =>
      apagarPorIds(
        client,
        counts,
        "ai_agent_runs",
        "ai_agent_runs",
        input.organizationId,
        "outbound_message_id",
        mensagens.ids,
      ),
    () =>
      apagarPorContato(
        client,
        counts,
        "llm_calls",
        "llm_calls",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorIds(
        client,
        counts,
        "llm_calls",
        "llm_calls",
        input.organizationId,
        "job_id",
        jobs.ids,
      ),
    () =>
      apagarPorIds(
        client,
        counts,
        "ai_invocations",
        "ai_invocations",
        input.organizationId,
        "conversation_id",
        conversas.ids,
      ),
    () =>
      apagarPorIds(
        client,
        counts,
        "ai_invocations",
        "ai_invocations",
        input.organizationId,
        "message_id",
        mensagens.ids,
      ),
    () =>
      apagarPorContato(
        client,
        counts,
        "before_send_traces",
        "before_send_traces",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorIds(
        client,
        counts,
        "before_send_traces",
        "before_send_traces",
        input.organizationId,
        "job_id",
        jobs.ids,
      ),
    () =>
      apagarPorContato(
        client,
        counts,
        "send_ledger",
        "send_ledger",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorIds(
        client,
        counts,
        "send_ledger",
        "send_ledger",
        input.organizationId,
        "job_id",
        jobs.ids,
      ),
    () =>
      apagarPorContato(
        client,
        counts,
        "job_queue",
        "job_queue",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorIds(client, counts, "event_log", "event_log", input.organizationId, "entity_id", [
        input.contactId,
        ...conversas.ids,
        ...mensagens.ids,
        ...leads.ids,
        ...zapsignDocumentos.ids,
        ...compromissos.rows.map((row) => row.id),
      ]),
    () =>
      apagarPorIds(
        client,
        counts,
        "messages",
        "messages",
        input.organizationId,
        "conversation_id",
        conversas.ids,
      ),
    () =>
      apagarPorContato(
        client,
        counts,
        "messages",
        "messages",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorContato(
        client,
        counts,
        "conversations",
        "conversations",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorContato(
        client,
        counts,
        "calendar_appointments",
        "calendar_appointments",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorContato(client, counts, "orders", "orders", input.organizationId, input.contactId),
    () =>
      apagarPorContato(
        client,
        counts,
        "crm_leads",
        "crm_leads",
        input.organizationId,
        input.contactId,
      ),
    () =>
      apagarPorIds(client, counts, "contacts", "contacts", input.organizationId, "id", [
        input.contactId,
      ]),
  ] as const) {
    const erro = await operacao();
    if (erro) return erro;
  }

  return { ok: true, counts };
}

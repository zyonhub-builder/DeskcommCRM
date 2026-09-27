import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";

import { resetarContatoDeTeste } from "@/lib/contacts/resetar-contato-de-teste";

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "33333333-3333-4333-8333-333333333333";
const CONTATO = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const MENSAGEM = "55555555-5555-4555-8555-555555555555";
const LEAD = "66666666-6666-4666-8666-666666666666";
const JOB = "77777777-7777-4777-8777-777777777777";
const COMPROMISSO = "88888888-8888-4888-8888-888888888888";
const DOCUMENTO_ZAPSIGN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHECKPOINT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOTA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ESTADO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TRANSICAO = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type Linha = Record<string, unknown>;

interface Delecao {
  tabela: string;
  filtros: Record<string, unknown>;
  count: number;
}

let tabelas: Record<string, Linha[]>;
const delecoes: Delecao[] = [];

class ConstrutorPostgrestFalso {
  private filtros: Array<
    | { tipo: "eq"; coluna: string; valor: unknown }
    | { tipo: "in"; coluna: string; valores: unknown[] }
  > = [];
  private modo: "select" | "delete" = "select";

  constructor(private readonly tabela: string) {}

  select(_colunas: string) {
    this.modo = "select";
    return this;
  }

  delete(_opcoes?: { count?: string }) {
    this.modo = "delete";
    return this;
  }

  eq(coluna: string, valor: unknown) {
    this.filtros.push({ tipo: "eq", coluna, valor });
    return this;
  }

  in(coluna: string, valores: readonly unknown[]) {
    this.filtros.push({ tipo: "in", coluna, valores: [...valores] });
    return this;
  }

  maybeSingle() {
    const [row] = this.linhasFiltradas();
    return Promise.resolve({ data: row ?? null, error: null });
  }

  then(resolve: (valor: { data?: Linha[]; count?: number | null; error: null }) => void) {
    if (this.modo === "delete") {
      const atuais = tabelas[this.tabela] ?? [];
      const removidas = atuais.filter((row) => this.casa(row));
      tabelas[this.tabela] = atuais.filter((row) => !this.casa(row));
      const filtros = Object.fromEntries(
        this.filtros.map((f) => [f.coluna, f.tipo === "in" ? [...f.valores] : f.valor]),
      );
      delecoes.push({ tabela: this.tabela, filtros, count: removidas.length });
      resolve({ count: removidas.length, error: null });
      return;
    }

    resolve({ data: this.linhasFiltradas(), error: null });
  }

  private linhasFiltradas(): Linha[] {
    return (tabelas[this.tabela] ?? []).filter((row) => this.casa(row));
  }

  private casa(row: Linha): boolean {
    return this.filtros.every((f) => {
      if (f.tipo === "eq") return row[f.coluna] === f.valor;
      return f.valores.includes(row[f.coluna]);
    });
  }
}

function clienteFalso(): SupabaseClient {
  return {
    from(tabela: string) {
      return new ConstrutorPostgrestFalso(tabela);
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  delecoes.length = 0;
  tabelas = {
    contacts: [
      { id: CONTATO, organization_id: ORG },
      { id: "99999999-9999-4999-8999-999999999999", organization_id: OUTRA_ORG },
    ],
    conversations: [{ id: CONVERSA, organization_id: ORG, contact_id: CONTATO }],
    messages: [
      { id: MENSAGEM, organization_id: ORG, conversation_id: CONVERSA, contact_id: CONTATO },
    ],
    crm_leads: [{ id: LEAD, organization_id: ORG, contact_id: CONTATO }],
    job_queue: [{ id: JOB, organization_id: ORG, contact_id: CONTATO }],
    calendar_appointments: [
      {
        id: COMPROMISSO,
        organization_id: ORG,
        contact_id: CONTATO,
        google_connection_id: null,
        google_calendar_id: null,
        google_event_id: null,
        google_etag: null,
      },
    ],
    zapsign_documents: [
      { id: DOCUMENTO_ZAPSIGN, organization_id: ORG, lead_id: LEAD, contact_id: CONTATO },
    ],
    ai_agent_runs: [{ id: "run-1", organization_id: ORG, contact_id: CONTATO }],
    llm_calls: [{ id: "llm-1", organization_id: ORG, contact_id: CONTATO, job_id: JOB }],
    ai_invocations: [
      { id: "inv-1", organization_id: ORG, conversation_id: CONVERSA, message_id: MENSAGEM },
    ],
    lead_checkpoints: [{ id: CHECKPOINT, organization_id: ORG, contact_id: CONTATO }],
    lead_notes: [{ id: NOTA, organization_id: ORG, contact_id: CONTATO }],
    lead_state: [{ id: ESTADO, organization_id: ORG, contact_id: CONTATO }],
    lead_state_transitions: [{ id: TRANSICAO, organization_id: ORG, contact_id: CONTATO }],
    before_send_traces: [{ id: "trace-1", organization_id: ORG, contact_id: CONTATO, job_id: JOB }],
    send_ledger: [{ id: "ledger-1", organization_id: ORG, contact_id: CONTATO, job_id: JOB }],
    event_log: [
      { id: "event-1", organization_id: ORG, entity_id: CONVERSA },
      { id: "event-2", organization_id: ORG, entity_id: DOCUMENTO_ZAPSIGN },
      { id: "event-3", organization_id: ORG, entity_id: NOTA },
    ],
    orders: [{ id: "order-1", organization_id: ORG, contact_id: CONTATO }],
  };
});

describe("resetarContatoDeTeste", () => {
  it("apaga só o grafo do contato dentro da organização informada", async () => {
    const resultado = await resetarContatoDeTeste(clienteFalso(), {
      organizationId: ORG,
      contactId: CONTATO,
    });

    expect(resultado.ok).toBe(true);
    expect(delecoes.length).toBeGreaterThan(0);
    expect(delecoes.filter((d) => d.filtros.organization_id !== ORG)).toEqual([]);
    expect(tabelas.contacts).toEqual([
      { id: "99999999-9999-4999-8999-999999999999", organization_id: OUTRA_ORG },
    ]);
    expect(tabelas.event_log).toEqual([]);
    expect(tabelas.lead_checkpoints).toEqual([]);
    expect(tabelas.lead_notes).toEqual([]);
    expect(tabelas.lead_state).toEqual([]);
    expect(tabelas.lead_state_transitions).toEqual([]);

    const apagadas = new Set(delecoes.map((d) => d.tabela));
    expect([...apagadas]).toEqual(
      expect.arrayContaining([
        "lead_checkpoints",
        "lead_notes",
        "lead_state",
        "lead_state_transitions",
      ]),
    );
    for (const preservada of [
      "organizations",
      "crm_pipelines",
      "crm_stages",
      "ai_agents",
      "ai_provider_credentials",
      "channel_sessions",
      "api_tokens",
      "api_audit_log",
    ]) {
      expect(apagadas.has(preservada)).toBe(false);
    }
  });

  it("remove mensagens, conversas e agenda antes do contato", async () => {
    await resetarContatoDeTeste(clienteFalso(), { organizationId: ORG, contactId: CONTATO });

    const ordem = delecoes.map((d) => d.tabela);
    const posContato = ordem.lastIndexOf("contacts");
    expect(posContato).toBeGreaterThan(-1);
    for (const restrita of ["messages", "conversations", "calendar_appointments"]) {
      expect(ordem.indexOf(restrita)).toBeGreaterThan(-1);
      expect(ordem.indexOf(restrita)).toBeLessThan(posContato);
    }
  });

  it("não emite DELETE quando o contato não pertence à organização", async () => {
    const resultado = await resetarContatoDeTeste(clienteFalso(), {
      organizationId: OUTRA_ORG,
      contactId: CONTATO,
    });

    expect(resultado).toMatchObject({ ok: false, error: "not_found" });
    expect(delecoes).toEqual([]);
  });
});

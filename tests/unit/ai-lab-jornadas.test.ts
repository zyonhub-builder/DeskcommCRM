import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/contacts/resetar-contato-de-teste", () => ({
  resetarContatoDeTeste: vi.fn(),
}));
vi.mock("@/lib/waha/ingest", () => ({
  dispatchWahaEvent: vi.fn(),
}));

import {
  cenarioJornadaSchema,
  iniciarRodadaSchema,
  listarLaboratorioDeJornadas,
  materializarPassosDaRodada,
  type CenarioDaJornada,
} from "@/lib/ai/lab/jornadas-reais";

function cenario(overrides: Partial<CenarioDaJornada> = {}): CenarioDaJornada {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    name: "Caminho feliz",
    description: null,
    channel_session_id: "33333333-3333-4333-8333-333333333333",
    agent_id: null,
    execution_mode: "simulated",
    expected_events: { sign_contract: true, create_calendar_event: true },
    phone_number: "+5511999999999",
    contact_name: "Cliente Teste",
    steps: [{ body: "Oi" }, { body: "Quero saber se tenho direito.", delay_seconds: 45 }],
    default_delay_seconds: 120,
    observation_seconds: 1800,
    is_active: true,
    created_at: "2026-09-27T12:00:00.000Z",
    updated_at: "2026-09-27T12:00:00.000Z",
    ...overrides,
  };
}

type RespostaFake = { data: unknown; error: null };

class ConsultaFake implements PromiseLike<RespostaFake> {
  constructor(
    private readonly table: string,
    private readonly selects: Map<string, string>,
    private readonly data: unknown,
  ) {}

  select(columns: string): this {
    this.selects.set(this.table, columns);
    return this;
  }

  eq(): this {
    return this;
  }

  is(): this {
    return this;
  }

  not(): this {
    return this;
  }

  order(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  then<TResult1 = RespostaFake, TResult2 = never>(
    onfulfilled?: ((value: RespostaFake) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.data, error: null }).then(onfulfilled, onrejected);
  }
}

describe("laboratório de jornadas reais", () => {
  it("valida o contrato do cenário com telefone E.164 e passos temporizados", () => {
    const parsed = cenarioJornadaSchema.parse({
      name: "Talismã · auxílio-acidente",
      description: "",
      channel_session_id: "33333333-3333-4333-8333-333333333333",
      phone_number: "+551151770706",
      contact_name: "Luan",
      steps: [{ body: "Oi", delay_seconds: "90" }],
      default_delay_seconds: "120",
      observation_seconds: "3600",
      is_active: true,
    });

    expect(parsed.phone_number).toBe("+551151770706");
    expect(parsed.steps[0]?.delay_seconds).toBe(90);
    expect(parsed.default_delay_seconds).toBe(120);
    expect(parsed.execution_mode).toBe("simulated");
    expect(parsed.expected_events).toEqual({
      sign_contract: true,
      create_calendar_event: true,
    });
  });

  it("recusa telefone sem DDI para não simular contato ambíguo", () => {
    expect(() =>
      cenarioJornadaSchema.parse({
        name: "Inválido",
        channel_session_id: null,
        phone_number: "11999999999",
        steps: [{ body: "Oi" }],
      }),
    ).toThrow();
  });

  it("materializa o atraso padrão no script da rodada sem alterar o cenário salvo", () => {
    const original = cenario();
    const script = materializarPassosDaRodada(original);

    expect(script).toEqual([
      { body: "Oi", delay_seconds: 120 },
      { body: "Quero saber se tenho direito.", delay_seconds: 45 },
    ]);
    expect(original.steps[0]).toEqual({ body: "Oi" });
  });

  it("define reset de contato como falso quando a rodada não pede explicitamente", () => {
    const parsed = iniciarRodadaSchema.parse({
      scenario_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(parsed.reset_existing_contact).toBe(false);
  });

  it("lista conexões usando colunas reais de channel_sessions", async () => {
    const selects = new Map<string, string>();
    const respostas: Record<string, unknown> = {
      ai_lab_runs: [],
      ai_lab_scenarios: [],
      channel_sessions: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          display_name: "Talismã WhatsApp",
          status: "WORKING",
          phone_number: "+551151770706",
          waha_session_name: "talismã-dev",
          provider: "waha",
        },
      ],
      ai_agents: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Talismã Previdenciário",
          is_active: true,
          paused_at: null,
          published_version_id: "55555555-5555-4555-8555-555555555555",
        },
      ],
    };
    const client = {
      from(table: string) {
        return new ConsultaFake(table, selects, respostas[table] ?? []);
      },
    };

    const result = await listarLaboratorioDeJornadas(
      client as never,
      "22222222-2222-4222-8222-222222222222",
    );

    expect(selects.get("channel_sessions")).toBe(
      "id,display_name,status,phone_number,waha_session_name,provider",
    );
    expect(selects.get("channel_sessions")).not.toContain("label");
    expect(selects.get("ai_agents")).toBe("id,name,is_active,paused_at,published_version_id");
    expect(result.channels).toEqual([
      {
        id: "33333333-3333-4333-8333-333333333333",
        label: "Talismã WhatsApp",
        phone_number: "+551151770706",
        status: "WORKING",
      },
    ]);
    expect(result.agents).toEqual([
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Talismã Previdenciário",
        is_active: true,
        paused_at: null,
        published_version_id: "55555555-5555-4555-8555-555555555555",
      },
    ]);
  });
});

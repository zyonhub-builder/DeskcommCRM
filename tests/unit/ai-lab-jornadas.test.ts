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
});

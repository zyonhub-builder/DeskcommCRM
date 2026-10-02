import { describe, expect, it } from "vitest";

import {
  montarDiagnosticoComercial,
  type LeadDiagnosticoRow,
  type MessageDiagnosticoRow,
} from "./diagnostico-comercial";

const JANELA = {
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-10-01T00:00:00.000Z",
  dias: 30,
};

function lead(parcial: Partial<LeadDiagnosticoRow>): LeadDiagnosticoRow {
  return {
    id: crypto.randomUUID(),
    created_at: "2026-09-10T12:00:00.000Z",
    closed_at: null,
    status: "open",
    source: "webhook",
    source_metadata: null,
    lost_reason: null,
    owner_kind: null,
    owner_user_id: null,
    owner_agent_id: null,
    ...parcial,
  };
}

function mensagem(parcial: Partial<MessageDiagnosticoRow>): MessageDiagnosticoRow {
  return {
    conversation_id: "conv-1",
    direction: "inbound",
    sent_via: "external_device",
    sent_at: "2026-09-10T12:00:00.000Z",
    ...parcial,
  };
}

describe("montarDiagnosticoComercial", () => {
  it("mede origem e custo sem chamar IA para abrir a tela", () => {
    const payload = montarDiagnosticoComercial({
      janela: JANELA,
      limite: 20_000,
      truncado: false,
      leadsCriados: [
        lead({ source_metadata: { utm_source: "meta", utm_campaign: "prev" } }),
        lead({ source: "manual" }),
      ],
      leadsFechados: [lead({ status: "won", closed_at: "2026-09-12T12:00:00.000Z" })],
      mensagens: [
        mensagem({
          conversation_id: "c1",
          direction: "inbound",
          sent_at: "2026-09-10T12:00:00.000Z",
        }),
        mensagem({
          conversation_id: "c1",
          direction: "outbound",
          sent_via: "ai",
          sent_at: "2026-09-10T12:00:30.000Z",
        }),
      ],
      conversas: [],
      chamadasIa: [
        {
          purpose: "turno",
          status: "ok",
          cost_cents: 12,
          latency_ms: 900,
          input_tokens: 100,
          output_tokens: 50,
        },
        {
          purpose: "turno",
          status: "erro",
          cost_cents: 0,
          latency_ms: 100,
          input_tokens: null,
          output_tokens: null,
        },
      ],
      captacoes: [
        {
          outcome: "created",
          source_name: "LP",
          origin: "meta",
          lead_id: "l1",
          utm: { utm_source: "meta" },
        },
      ],
      atividades: [{ actor_kind: "ai", type: "stage_changed" }],
    });

    expect(payload.regua.custo_da_tela_cents).toBe(0);
    expect(payload.regua.leitura_sem_ia).toBe(true);
    expect(payload.aquisicao.percentual_rastreado).toBe(0.5);
    expect(payload.ia.custo_cents).toBe(12);
    expect(payload.ia.custo_analise_cents).toBe(0);
    expect(payload.ia.chamadas).toBe(2);
    expect(payload.ia.erros).toBe(1);
  });

  it("sinaliza gargalo comercial quando entrada fica sem resposta posterior", () => {
    const payload = montarDiagnosticoComercial({
      janela: JANELA,
      limite: 20_000,
      truncado: false,
      leadsCriados: Array.from({ length: 12 }, (_, i) =>
        lead({
          id: crypto.randomUUID(),
          source_metadata: { utm_source: "google", utm_campaign: `c${i}` },
        }),
      ),
      leadsFechados: [
        lead({ status: "lost", closed_at: "2026-09-12T12:00:00.000Z", lost_reason: "sumiu" }),
      ],
      mensagens: [
        mensagem({
          conversation_id: "c1",
          direction: "inbound",
          sent_at: "2026-09-10T12:00:00.000Z",
        }),
        mensagem({
          conversation_id: "c2",
          direction: "inbound",
          sent_at: "2026-09-10T12:05:00.000Z",
        }),
        mensagem({
          conversation_id: "c2",
          direction: "outbound",
          sent_via: "user",
          sent_at: "2026-09-10T15:05:00.000Z",
        }),
      ],
      conversas: [],
      chamadasIa: [],
      captacoes: [],
      atividades: [],
    });

    expect(payload.diagnostico.foco).toBe("comercial");
    expect(payload.atendimento.conversas_sem_resposta_apos_entrada).toBe(1);
    expect(payload.diagnostico.sinais.map((s) => s.titulo)).toContain(
      "Entradas sem resposta no período",
    );
    expect(payload.diagnostico.sinais.map((s) => s.titulo)).toContain("Resposta humana lenta");
  });
});

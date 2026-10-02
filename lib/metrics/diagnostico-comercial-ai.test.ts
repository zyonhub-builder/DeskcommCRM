import { describe, expect, it, vi } from "vitest";

import {
  montarDiagnosticoComercial,
  type LeadDiagnosticoRow,
  type MessageDiagnosticoRow,
} from "./diagnostico-comercial";
import {
  DIAGNOSTICO_COMERCIAL_IA_PURPOSE,
  analiseIaDiagnosticoComercialPayloadSchema,
  carregarReferenciaLlmDiagnosticoComercial,
  montarPromptAnaliseIaDiagnosticoComercial,
  parseAnaliseIaDiagnosticoComercial,
} from "./diagnostico-comercial-ai";
import { normalizarRelatorioAnaliseIaDiagnosticoComercial } from "./diagnostico-comercial-reports";

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
    source: "whatsapp",
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

function payloadAgregado() {
  return montarDiagnosticoComercial({
    janela: JANELA,
    limite: 20_000,
    truncado: false,
    leadsCriados: [
      lead({ source_metadata: { utm_source: "meta", utm_campaign: "prev" } }),
      lead({ source: "manual" }),
    ],
    leadsFechados: [lead({ status: "lost", closed_at: "2026-09-12T12:00:00.000Z" })],
    mensagens: [
      mensagem({ conversation_id: "c1", direction: "inbound" }),
      mensagem({
        conversation_id: "c1",
        direction: "outbound",
        sent_via: "user",
        sent_at: "2026-09-10T13:00:00.000Z",
      }),
    ],
    conversas: [],
    chamadasIa: [
      {
        purpose: "agent_turn",
        status: "ok",
        cost_cents: 20,
        latency_ms: 1200,
        input_tokens: 300,
        output_tokens: 120,
      },
    ],
    captacoes: [],
    atividades: [{ actor_kind: "user", type: "note_added" }],
  });
}

describe("diagnóstico comercial com IA", () => {
  it("herda provider, modelo e credencial de um agente publicado quando o ponto não tem binding", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("from ai_purpose_bindings")) return { rows: [] };
      if (sql.includes("from ai_agents")) {
        return {
          rows: [
            {
              provider: "openrouter",
              model: "openai/gpt-5-mini",
              credential_id: "11111111-1111-4111-8111-111111111111",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const referencia = await carregarReferenciaLlmDiagnosticoComercial(
      { query } as never,
      "22222222-2222-4222-8222-222222222222",
    );

    expect(referencia).toEqual({
      model: "openai/gpt-5-mini",
      llmOverride: {
        provider: "openrouter",
        credentialId: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(query.mock.calls[1]?.[0]).toContain("v.id = a.published_version_id");
    expect(query.mock.calls[1]?.[0]).toContain("c.validated_at is not null");
  });

  it("não troca um binding explícito do diagnóstico por agente publicado", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("from ai_purpose_bindings")) return { rows: [{ existe: 1 }] };
      throw new Error("não deveria consultar agentes quando há binding explícito");
    });

    await expect(
      carregarReferenciaLlmDiagnosticoComercial(
        { query } as never,
        "22222222-2222-4222-8222-222222222222",
      ),
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("monta prompt só com agregados e declara que não envia corpo de mensagem", () => {
    const prompt = montarPromptAnaliseIaDiagnosticoComercial(payloadAgregado());
    const user = JSON.parse(prompt.user) as { regras: string[]; diagnostico: unknown };
    const diagnosticoSerializado = JSON.stringify(user.diagnostico);

    expect(prompt.system).toContain("Leia somente os agregados");
    expect(user.regras).toContain(
      "Não diga que leu as conversas; este payload não inclui corpo de mensagem.",
    );
    expect(diagnosticoSerializado).toContain('"mensagens_entrada":1');
    expect(diagnosticoSerializado).not.toContain("body");
    expect(diagnosticoSerializado).not.toContain("tive um acidente");
  });

  it("extrai JSON cercado por markdown e valida o contrato da resposta", () => {
    const analise = parseAnaliseIaDiagnosticoComercial(`\`\`\`json
{
  "titulo": "Resposta humana lenta com rastreio parcial",
  "resumo": "A leitura indica que ainda existe pouco volume para cravar tendência, mas já há sinais objetivos para melhorar o rastreio e a rotina comercial.",
  "conclusao": {
    "eixo_principal": "misto",
    "confianca": "media",
    "justificativa": "O volume é pequeno e parte dos leads não tem origem rastreável, então a análise deve orientar próximos passos sem cravar culpa única."
  },
  "achados": [
    {
      "eixo": "dados",
      "prioridade": "media",
      "titulo": "Amostra ainda pequena",
      "evidencia": "2 leads criados no período",
      "interpretacao": "O período ainda não tem massa suficiente para afirmar que a mídia ou o comercial são o gargalo principal.",
      "acao": "Acompanhar mais volume e manter UTMs padronizadas antes de redistribuir orçamento."
    }
  ],
  "proximos_passos": ["Padronizar UTMs antes da próxima leitura."],
  "limites": ["A análise não leu o corpo das mensagens."]
}
\`\`\``);

    expect(analise.conclusao.eixo_principal).toBe("misto");
    expect(analise.achados[0]?.prioridade).toBe("media");
    expect(analise.limites).toContain("A análise não leu o corpo das mensagens.");
  });

  it("valida o payload enriquecido com custo e prompt usado", () => {
    const payload = analiseIaDiagnosticoComercialPayloadSchema.parse({
      titulo: "Prioridade em resposta humana",
      resumo:
        "A leitura mostra volume pequeno, mas já permite separar rastreamento incompleto de rotina comercial lenta.",
      conclusao: {
        eixo_principal: "operacao",
        confianca: "baixa",
        justificativa:
          "A amostra ainda é pequena e não há fechamentos suficientes, então a conclusão deve guiar próximos passos.",
      },
      achados: [
        {
          eixo: "dados",
          prioridade: "alta",
          titulo: "Origem pouco rastreada",
          evidencia: "0% dos leads têm origem rastreável",
          interpretacao:
            "Sem campanha identificada, a análise não consegue responsabilizar aquisição com segurança.",
          acao: "Padronizar links rastreáveis antes de redistribuir orçamento.",
        },
      ],
      proximos_passos: ["Padronizar UTMs dos links de entrada."],
      limites: ["A análise não leu o corpo das mensagens."],
      custo: {
        purpose: DIAGNOSTICO_COMERCIAL_IA_PURPOSE,
        call_id: "11111111-1111-4111-8111-111111111111",
        provider: "openai",
        model: "gpt-5-mini",
        cost_cents: 2,
        input_tokens: 2055,
        output_tokens: 996,
        latency_ms: 15_700,
      },
      regua: {
        analisou_corpo_mensagens: false,
        fonte: "agregados_do_diagnostico",
        observacoes: ["Sem corpo das mensagens."],
      },
      prompt: {
        system: "Use somente agregados.",
        user: '{"diagnostico":true}',
      },
    });

    expect(payload.custo.cost_cents).toBe(2);
    expect(payload.prompt?.system).toContain("agregados");
  });

  it("normaliza relatório salvo com metadados e prompt auditável", () => {
    const relatorio = normalizarRelatorioAnaliseIaDiagnosticoComercial({
      id: "33333333-3333-4333-8333-333333333333",
      organization_id: "22222222-2222-4222-8222-222222222222",
      created_by_user_id: "44444444-4444-4444-8444-444444444444",
      from_at: "2026-09-01T00:00:00.000Z",
      to_at: "2026-10-01T00:00:00.000Z",
      period_days: 30,
      llm_call_id: "11111111-1111-4111-8111-111111111111",
      provider: "openai",
      model: "gpt-5-mini",
      cost_cents: "2",
      input_tokens: 2055,
      output_tokens: 996,
      latency_ms: 15_700,
      created_at: "2026-09-29T17:30:00.000Z",
      prompt: {
        system: "Use somente agregados.",
        user: '{"diagnostico":true}',
      },
      analysis: {
        titulo: "Prioridade em rastreio e rotina comercial",
        resumo:
          "A leitura mostra volume pequeno, com rastreamento incompleto e sinais objetivos para organizar retorno humano.",
        conclusao: {
          eixo_principal: "dados",
          confianca: "baixa",
          justificativa:
            "A amostra ainda é pequena e não há fechamentos suficientes para cravar o gargalo.",
        },
        achados: [
          {
            eixo: "dados",
            prioridade: "alta",
            titulo: "Origem pouco rastreada",
            evidencia: "0% dos leads têm origem rastreável",
            interpretacao:
              "Sem campanha identificada, a análise não consegue responsabilizar aquisição com segurança.",
            acao: "Padronizar links rastreáveis antes de redistribuir orçamento.",
          },
        ],
        proximos_passos: ["Padronizar UTMs dos links de entrada."],
        limites: ["A análise não leu o corpo das mensagens."],
        custo: {
          purpose: DIAGNOSTICO_COMERCIAL_IA_PURPOSE,
          call_id: "11111111-1111-4111-8111-111111111111",
          provider: "openai",
          model: "gpt-5-mini",
          cost_cents: 2,
          input_tokens: 2055,
          output_tokens: 996,
          latency_ms: 15_700,
        },
        regua: {
          analisou_corpo_mensagens: false,
          fonte: "agregados_do_diagnostico",
          observacoes: ["Sem corpo das mensagens."],
        },
      },
    });

    expect(relatorio.janela.dias).toBe(30);
    expect(relatorio.analise.relatorio?.id).toBe("33333333-3333-4333-8333-333333333333");
    expect(relatorio.analise.prompt?.system).toContain("agregados");
  });

  it("rejeita resposta sem achados acionáveis", () => {
    expect(() =>
      parseAnaliseIaDiagnosticoComercial(
        JSON.stringify({
          titulo: "Incompleto",
          resumo: "Texto suficientemente longo para passar pelo tamanho mínimo do resumo.",
          conclusao: {
            eixo_principal: "dados",
            confianca: "baixa",
            justificativa: "Texto suficientemente longo para explicar a limitação.",
          },
          achados: [],
          proximos_passos: ["Medir novamente."],
          limites: ["Sem análise semântica."],
        }),
      ),
    ).toThrow();
  });
});

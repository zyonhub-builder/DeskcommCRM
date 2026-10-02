import { beforeAll, describe, expect, it } from "vitest";

import { countAs, GOV_AGENT_A, GOV_MANAGER, GOV_ORG, seedGov, sql } from "./gov-helpers";

const ORG_B = "0452bbbb-0000-4000-8000-000000000002";
const MANAGER_B = "0452bbbb-1111-4000-8000-000000000002";
const REPORT_A = "0452aaaa-2222-4000-8000-000000000001";
const REPORT_B = "0452bbbb-2222-4000-8000-000000000002";

function analysisJson(titulo: string): string {
  return JSON.stringify({
    titulo,
    resumo:
      "A leitura usa apenas agregados e indica próximos passos operacionais sem ler corpo de conversa.",
    conclusao: {
      eixo_principal: "dados",
      confianca: "baixa",
      justificativa:
        "A amostra ainda é pequena e o rastreamento precisa melhorar antes de cravar o gargalo.",
    },
    achados: [
      {
        eixo: "dados",
        prioridade: "alta",
        titulo: "Origem pouco rastreada",
        evidencia: "0% dos leads têm origem rastreável",
        interpretacao:
          "Sem campanha identificada, a análise não consegue separar aquisição e comercial.",
        acao: "Padronizar links rastreáveis antes da próxima leitura.",
      },
    ],
    proximos_passos: ["Padronizar UTMs dos links de entrada."],
    limites: ["A análise não leu o corpo das mensagens."],
    custo: {
      purpose: "commercial_diagnosis_analysis",
      call_id: null,
      provider: "openai",
      model: "gpt-5-mini",
      cost_cents: 2,
      input_tokens: 100,
      output_tokens: 50,
      latency_ms: 1200,
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
}

beforeAll(() => {
  seedGov();
  sql(`
    insert into auth.users (id, email)
      values ('${MANAGER_B}', '0452-manager-b@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', '0452-inv-b', 'Commercial Diagnosis Reports B', 'CDR B')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${MANAGER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;
    insert into public.commercial_diagnosis_reports
      (id, organization_id, created_by_user_id, from_at, to_at, period_days, analysis, prompt,
       provider, model, cost_cents, input_tokens, output_tokens, latency_ms)
    values
      ('${REPORT_A}', '${GOV_ORG}', '${GOV_MANAGER}', '2026-09-01T00:00:00Z',
       '2026-10-01T00:00:00Z', 30, $a$${analysisJson("Relatório da organização A")}$a$::jsonb,
       '{"system":"Use somente agregados.","user":"{}"}'::jsonb, 'openai', 'gpt-5-mini', 2, 100, 50, 1200),
      ('${REPORT_B}', '${ORG_B}', '${MANAGER_B}', '2026-09-01T00:00:00Z',
       '2026-10-01T00:00:00Z', 30, $b$${analysisJson("Relatório da organização B")}$b$::jsonb,
       '{"system":"Use somente agregados.","user":"{}"}'::jsonb, 'openai', 'gpt-5-mini', 2, 100, 50, 1200)
    on conflict (id) do nothing;
  `);
});

describe("0452 · commercial_diagnosis_reports", () => {
  it("nasce com RLS e leitura direta restrita a manager+", () => {
    expect(
      sql("select relrowsecurity from pg_class where relname = 'commercial_diagnosis_reports';"),
    ).toBe("t");
    expect(
      sql(
        "select has_table_privilege('authenticated', 'public.commercial_diagnosis_reports', 'INSERT');",
      ),
    ).toBe("f");
  });

  it("manager lê só relatórios da própria organização", () => {
    expect(
      countAs(
        GOV_MANAGER,
        `select count(*) from public.commercial_diagnosis_reports where id = '${REPORT_A}';`,
      ),
    ).toBe(1);
    expect(
      countAs(
        GOV_MANAGER,
        `select count(*) from public.commercial_diagnosis_reports where id = '${REPORT_B}';`,
      ),
    ).toBe(0);
    expect(
      countAs(
        MANAGER_B,
        `select count(*) from public.commercial_diagnosis_reports where id = '${REPORT_A}';`,
      ),
    ).toBe(0);
  });

  it("agent não lê o histórico do diagnóstico comercial", () => {
    expect(
      countAs(
        GOV_AGENT_A,
        `select count(*) from public.commercial_diagnosis_reports where id = '${REPORT_A}';`,
      ),
    ).toBe(0);
  });
});

import { z } from "zod";
import type pg from "pg";

import type { LlmResolveOverride } from "@/lib/agent-engine/edge/llm/credentials";

import type { DiagnosticoComercialPayload } from "@/lib/metrics/diagnostico-comercial";

export const DIAGNOSTICO_COMERCIAL_IA_PURPOSE = "commercial_diagnosis_analysis";

const eixoSchema = z.enum(["aquisicao", "comercial", "operacao", "ia", "dados", "misto"]);
const prioridadeSchema = z.enum(["baixa", "media", "alta"]);
const confiancaSchema = z.enum(["baixa", "media", "alta"]);

export const analiseIaDiagnosticoComercialSchema = z.object({
  titulo: z.string().trim().min(3).max(140),
  resumo: z.string().trim().min(20).max(900),
  conclusao: z.object({
    eixo_principal: eixoSchema,
    confianca: confiancaSchema,
    justificativa: z.string().trim().min(20).max(900),
  }),
  achados: z
    .array(
      z.object({
        eixo: eixoSchema,
        prioridade: prioridadeSchema,
        titulo: z.string().trim().min(3).max(120),
        evidencia: z.string().trim().min(5).max(500),
        interpretacao: z.string().trim().min(20).max(900),
        acao: z.string().trim().min(10).max(500),
      }),
    )
    .min(1)
    .max(5),
  proximos_passos: z.array(z.string().trim().min(5).max(240)).min(1).max(5),
  limites: z.array(z.string().trim().min(5).max(240)).min(1).max(5),
});

export type AnaliseIaDiagnosticoComercial = z.infer<typeof analiseIaDiagnosticoComercialSchema>;

export const promptAnaliseIaDiagnosticoComercialSchema = z.object({
  system: z.string().min(1).max(20_000),
  user: z.string().min(1).max(120_000),
});

export const analiseIaDiagnosticoComercialPayloadSchema =
  analiseIaDiagnosticoComercialSchema.extend({
    custo: z.object({
      purpose: z.literal(DIAGNOSTICO_COMERCIAL_IA_PURPOSE),
      call_id: z.string().uuid().nullable(),
      provider: z.string().min(1),
      model: z.string().min(1),
      cost_cents: z.number().nullable(),
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
      latency_ms: z.number().int().nonnegative(),
    }),
    regua: z.object({
      analisou_corpo_mensagens: z.literal(false),
      fonte: z.literal("agregados_do_diagnostico"),
      observacoes: z.array(z.string().min(1)),
    }),
    prompt: promptAnaliseIaDiagnosticoComercialSchema.optional(),
    relatorio: z
      .object({
        id: z.string().uuid(),
        created_at: z.string().datetime({ offset: true }),
      })
      .optional(),
  });

export type AnaliseIaDiagnosticoComercialPayload = z.infer<
  typeof analiseIaDiagnosticoComercialPayloadSchema
>;

export interface ReferenciaLlmDiagnosticoComercial {
  model: string;
  llmOverride: LlmResolveOverride;
}

/**
 * Fallback para instalações onde os agentes têm provider/modelo/credencial
 * publicados, mas a organização ainda não configurou um padrão global de IA.
 *
 * Não lemos chave aqui: só ponteiros já validados. Binding explícito do ponto
 * continua soberano; se existe, a rota deve mostrar o erro de configuração
 * dele em vez de trocar silenciosamente para outro modelo.
 */
export async function carregarReferenciaLlmDiagnosticoComercial(
  db: Pick<pg.Pool, "query">,
  organizationId: string,
): Promise<ReferenciaLlmDiagnosticoComercial | null> {
  const binding = await db.query<{ existe: number }>(
    `select 1 as existe
       from ai_purpose_bindings
      where organization_id = $1
        and purpose = $2
        and is_enabled
      limit 1`,
    [organizationId, DIAGNOSTICO_COMERCIAL_IA_PURPOSE],
  );
  if (binding.rows.length > 0) return null;

  const { rows } = await db.query<{
    provider: string;
    model: string;
    credential_id: string | null;
  }>(
    `select v.provider, v.model, v.credential_id
       from ai_agents a
       join ai_agent_versions v
         on v.organization_id = a.organization_id
        and v.id = a.published_version_id
       left join ai_provider_credentials c
         on c.organization_id = a.organization_id
        and c.id = v.credential_id
        and c.provider = v.provider
        and c.is_active
        and c.validated_at is not null
      where a.organization_id = $1
        and a.archived_at is null
        and a.published_version_id is not null
        and v.status = 'published'
        and v.model is not null
        and v.model <> ''
        and (v.credential_id is null or c.id is not null)
      order by (v.credential_id is not null) desc,
               (a.is_default is true) desc,
               a.priority desc,
               a.created_at asc
      limit 1`,
    [organizationId],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    model: row.model,
    llmOverride: { provider: row.provider, credentialId: row.credential_id },
  };
}

function compactoParaModelo(payload: DiagnosticoComercialPayload) {
  return {
    janela: payload.janela,
    aquisicao: payload.aquisicao,
    funil: payload.funil,
    atendimento: payload.atendimento,
    atividades: payload.atividades,
    ia: payload.ia,
    diagnostico_objetivo: payload.diagnostico,
    regua: {
      leitura_sem_ia_ao_abrir: payload.regua.leitura_sem_ia,
      custo_da_tela_cents: payload.regua.custo_da_tela_cents,
      truncado: payload.regua.truncado,
      observacoes: payload.regua.observacoes,
    },
  };
}

export function montarPromptAnaliseIaDiagnosticoComercial(payload: DiagnosticoComercialPayload): {
  system: string;
  user: string;
} {
  return {
    system:
      "Você é um analista comercial sênior para operações de atendimento jurídico e CRM. " +
      "Leia somente os agregados fornecidos. Não invente conteúdo de mensagens, nomes, telefones, objeções ou intenção individual. " +
      "Separe com cuidado origem ruim de processo comercial ruim. Se a amostra for pequena ou o rastreio estiver ruim, diga que a confiança é baixa. " +
      "Responda exclusivamente JSON válido, sem markdown, no schema pedido.",
    user: JSON.stringify(
      {
        tarefa:
          "Gerar uma análise executiva, curta e acionável, sobre o diagnóstico comercial abaixo.",
        schema_esperado: {
          titulo: "string",
          resumo: "string",
          conclusao: {
            eixo_principal: "aquisicao|comercial|operacao|ia|dados|misto",
            confianca: "baixa|media|alta",
            justificativa: "string",
          },
          achados: [
            {
              eixo: "aquisicao|comercial|operacao|ia|dados|misto",
              prioridade: "baixa|media|alta",
              titulo: "string",
              evidencia: "string com número ou fato do payload",
              interpretacao: "string",
              acao: "string",
            },
          ],
          proximos_passos: ["string"],
          limites: ["string"],
        },
        regras: [
          "Use pt-BR.",
          "Não diga que leu as conversas; este payload não inclui corpo de mensagem.",
          "Não culpe aquisição se o rastreamento de origem estiver baixo.",
          "Não culpe comercial se a amostra de leads ou fechamentos for insuficiente.",
          "Cite números do payload na evidência.",
          "Dê no máximo 5 achados e 5 próximos passos.",
        ],
        diagnostico: compactoParaModelo(payload),
      },
      null,
      2,
    ),
  };
}

function extrairJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    const bloco = /```(?:json)?\s*([\s\S]*?)```/i.exec(texto);
    if (bloco?.[1]) {
      try {
        return JSON.parse(bloco[1]);
      } catch {
        /* tenta recorte por chaves abaixo */
      }
    }
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) return JSON.parse(texto.slice(inicio, fim + 1));
    throw new Error("A IA não retornou JSON.");
  }
}

export function parseAnaliseIaDiagnosticoComercial(texto: string): AnaliseIaDiagnosticoComercial {
  return analiseIaDiagnosticoComercialSchema.parse(extrairJson(texto));
}

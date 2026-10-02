import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  LlmBudgetExceededError,
  LlmNotConfiguredError,
  llmEdgeConfigFromEnv,
  runModelCall,
} from "@/lib/agent-engine/edge/llm/run-model-call";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  DIAGNOSTICO_COMERCIAL_IA_PURPOSE,
  carregarReferenciaLlmDiagnosticoComercial,
  montarPromptAnaliseIaDiagnosticoComercial,
  parseAnaliseIaDiagnosticoComercial,
  type AnaliseIaDiagnosticoComercialPayload,
} from "@/lib/metrics/diagnostico-comercial-ai";
import {
  listarRelatoriosAnaliseIaDiagnosticoComercial,
  salvarRelatorioAnaliseIaDiagnosticoComercial,
} from "@/lib/metrics/diagnostico-comercial-reports";
import {
  carregarDiagnosticoComercial,
  DIAGNOSTICO_COMERCIAL_MAX_DIAS,
  janelaDiagnosticoComercialSchema,
  janelaDiagnosticoInvalida,
  resolveJanelaDiagnosticoComercial,
} from "@/lib/metrics/diagnostico-comercial-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const bodySchema = janelaDiagnosticoComercialSchema;
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

function erroDeConfigLlmSemSaida(erro: unknown): boolean {
  return (
    erro instanceof LlmNotConfiguredError ||
    (erro instanceof Error && erro.message.includes("modelo LLM não definido"))
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "metrics" });
  if (!authz.ok) return authz.response;

  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsedQuery = querySchema.safeParse({
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsedQuery.success) {
    return fail("validation_failed", t("Query inválida."), 422, {
      requestId,
      details: parsedQuery.error.flatten().fieldErrors,
    });
  }

  try {
    const relatorios = await listarRelatoriosAnaliseIaDiagnosticoComercial({
      admin: createAdminClient(),
      organizationId: authz.org.orgId,
      limit: parsedQuery.data.limit,
    });
    return ok({ relatorios }, { requestId });
  } catch (erro) {
    return fail(
      "internal_error",
      erro instanceof Error
        ? erro.message
        : t("Não foi possível carregar o histórico de análises."),
      500,
      { requestId },
    );
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "metrics" });
  if (!authz.ok) return authz.response;

  const supportDenied = await requireSupportWrite(authz.org.orgId);
  if (supportDenied) return supportDenied;

  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsedBody = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return fail("validation_failed", t("Body inválido."), 422, {
      requestId,
      details: parsedBody.error.flatten().fieldErrors,
    });
  }

  const janela = resolveJanelaDiagnosticoComercial(parsedBody.data);
  const erroDaJanela = janelaDiagnosticoInvalida(janela);
  if (erroDaJanela === "ordem") {
    return fail("validation_failed", t("Janela inválida: 'from' deve ser anterior a 'to'."), 422, {
      requestId,
    });
  }
  if (erroDaJanela === "limite") {
    return fail(
      "validation_failed",
      t(`Janela inválida: use no máximo ${DIAGNOSTICO_COMERCIAL_MAX_DIAS} dias.`),
      422,
      { requestId },
    );
  }

  const organizationId = authz.org.orgId;
  const fromIso = janela.from.toISOString();
  const toIso = janela.to.toISOString();

  try {
    const admin = createAdminClient();
    const pool = getRequestPool();
    const diagnostico = await carregarDiagnosticoComercial({
      admin,
      organizationId,
      fromIso,
      toIso,
    });
    const prompt = montarPromptAnaliseIaDiagnosticoComercial(diagnostico);
    const inputDaAnalise = {
      tenantId: organizationId,
      purpose: "commercial_diagnosis_analysis",
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      maxOutputTokens: 1600,
    } satisfies Parameters<typeof runModelCall>[2];

    let chamada: Awaited<ReturnType<typeof runModelCall>>;
    try {
      chamada = await runModelCall(pool, llmEdgeConfigFromEnv(env), inputDaAnalise);
    } catch (erro) {
      if (!erroDeConfigLlmSemSaida(erro)) throw erro;
      const referencia = await carregarReferenciaLlmDiagnosticoComercial(pool, organizationId);
      if (referencia === null) throw erro;
      chamada = await runModelCall(pool, llmEdgeConfigFromEnv(env), {
        ...inputDaAnalise,
        model: referencia.model,
        llmOverride: referencia.llmOverride,
      });
    }

    const analise = parseAnaliseIaDiagnosticoComercial(chamada.result.text);
    const payload: AnaliseIaDiagnosticoComercialPayload = {
      ...analise,
      custo: {
        purpose: DIAGNOSTICO_COMERCIAL_IA_PURPOSE,
        call_id: chamada.callId,
        provider: chamada.provider,
        model: chamada.model,
        cost_cents: chamada.costCents,
        input_tokens: chamada.usage.inputTokens,
        output_tokens: chamada.usage.outputTokens,
        latency_ms: chamada.latencyMs,
      },
      regua: {
        analisou_corpo_mensagens: false,
        fonte: "agregados_do_diagnostico",
        observacoes: [
          "A análise usa o payload agregado do diagnóstico comercial.",
          "O corpo das mensagens não é enviado para a IA nesta versão.",
          "O custo desta chamada fica registrado em llm_calls com purpose commercial_diagnosis_analysis.",
        ],
      },
      prompt,
    };
    const relatorio = await salvarRelatorioAnaliseIaDiagnosticoComercial({
      admin,
      organizationId,
      userId: authz.user.id,
      janela: diagnostico.janela,
      analise: payload,
    });

    void audit({
      action: "metrics.diagnostico_comercial_ai_generated",
      actorUserId: authz.user.id,
      organizationId,
      resourceType: "commercial_diagnosis_report",
      resourceId: relatorio.id,
      requestId,
      metadata: {
        purpose: DIAGNOSTICO_COMERCIAL_IA_PURPOSE,
        llm_call_id: chamada.callId,
        from: fromIso,
        to: toIso,
        provider: chamada.provider,
        model: chamada.model,
        cost_cents: chamada.costCents,
        input_tokens: chamada.usage.inputTokens,
        output_tokens: chamada.usage.outputTokens,
        eixo_principal: payload.conclusao.eixo_principal,
        confianca: payload.conclusao.confianca,
      },
    });

    return ok(relatorio.analise, { requestId });
  } catch (erro) {
    if (erro instanceof LlmBudgetExceededError) {
      return fail(
        "unprocessable_entity",
        t("O orçamento mensal de IA desta organização foi atingido."),
        422,
        { requestId },
      );
    }
    if (erroDeConfigLlmSemSaida(erro)) {
      return fail(
        "unprocessable_entity",
        t("Nenhum provedor de IA está configurado para gerar esta análise."),
        422,
        { requestId },
      );
    }
    if (erro instanceof z.ZodError) {
      return fail(
        "ai_provider_error",
        t("A IA respondeu fora do formato esperado. Tente novamente."),
        502,
        { requestId, details: erro.flatten() },
      );
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (mensagem.includes("SUPABASE_DB_URL")) {
      return fail(
        "unavailable",
        t("A análise com IA precisa da conexão SQL da instalação para registrar custo."),
        503,
        { requestId },
      );
    }
    return fail("ai_provider_error", t("Não foi possível gerar a análise com IA agora."), 502, {
      requestId,
    });
  }
}

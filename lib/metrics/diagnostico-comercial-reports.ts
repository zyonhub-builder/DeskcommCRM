import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  analiseIaDiagnosticoComercialPayloadSchema,
  promptAnaliseIaDiagnosticoComercialSchema,
  type AnaliseIaDiagnosticoComercialPayload,
} from "@/lib/metrics/diagnostico-comercial-ai";
import type { DiagnosticoComercialPayload } from "@/lib/metrics/diagnostico-comercial";

const dinheiroCentsSchema = z
  .union([z.number(), z.string().transform((valor) => Number(valor))])
  .nullable();

const linhaRelatorioDiagnosticoComercialSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_by_user_id: z.string().uuid().nullable(),
  from_at: z.string().datetime({ offset: true }),
  to_at: z.string().datetime({ offset: true }),
  period_days: z.number().int().positive(),
  analysis: z.unknown(),
  prompt: z.unknown().nullable(),
  llm_call_id: z.string().uuid().nullable(),
  provider: z.string(),
  model: z.string(),
  cost_cents: dinheiroCentsSchema,
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  latency_ms: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
});

export const relatorioAnaliseIaDiagnosticoComercialSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  created_by_user_id: z.string().uuid().nullable(),
  janela: z.object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    dias: z.number().int().positive(),
  }),
  analise: analiseIaDiagnosticoComercialPayloadSchema,
});

export type RelatorioAnaliseIaDiagnosticoComercial = z.infer<
  typeof relatorioAnaliseIaDiagnosticoComercialSchema
>;

export const relatoriosAnaliseIaDiagnosticoComercialSchema = z.object({
  relatorios: z.array(relatorioAnaliseIaDiagnosticoComercialSchema),
});

type LinhaRelatorioDiagnosticoComercial = z.infer<typeof linhaRelatorioDiagnosticoComercialSchema>;

const SELECT_RELATORIO = [
  "id",
  "organization_id",
  "created_by_user_id",
  "from_at",
  "to_at",
  "period_days",
  "analysis",
  "prompt",
  "llm_call_id",
  "provider",
  "model",
  "cost_cents",
  "input_tokens",
  "output_tokens",
  "latency_ms",
  "created_at",
].join(", ");

function analiseComMetadadosDoRelatorio(
  linha: LinhaRelatorioDiagnosticoComercial,
): AnaliseIaDiagnosticoComercialPayload {
  const analise = analiseIaDiagnosticoComercialPayloadSchema.parse(linha.analysis);
  const promptSalvo = promptAnaliseIaDiagnosticoComercialSchema.safeParse(linha.prompt);
  return {
    ...analise,
    prompt: analise.prompt ?? (promptSalvo.success ? promptSalvo.data : undefined),
    relatorio: {
      id: linha.id,
      created_at: linha.created_at,
    },
  };
}

export function normalizarRelatorioAnaliseIaDiagnosticoComercial(
  entrada: unknown,
): RelatorioAnaliseIaDiagnosticoComercial {
  const linha = linhaRelatorioDiagnosticoComercialSchema.parse(entrada);
  return {
    id: linha.id,
    created_at: linha.created_at,
    created_by_user_id: linha.created_by_user_id,
    janela: {
      from: linha.from_at,
      to: linha.to_at,
      dias: linha.period_days,
    },
    analise: analiseComMetadadosDoRelatorio(linha),
  };
}

export async function listarRelatoriosAnaliseIaDiagnosticoComercial({
  admin,
  organizationId,
  limit,
}: {
  admin: SupabaseClient;
  organizationId: string;
  limit: number;
}): Promise<RelatorioAnaliseIaDiagnosticoComercial[]> {
  const { data, error } = await admin
    .from("commercial_diagnosis_reports")
    .select(SELECT_RELATORIO)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((linha) => normalizarRelatorioAnaliseIaDiagnosticoComercial(linha));
}

export async function carregarRelatorioAnaliseIaDiagnosticoComercial({
  admin,
  organizationId,
  reportId,
}: {
  admin: SupabaseClient;
  organizationId: string;
  reportId: string;
}): Promise<RelatorioAnaliseIaDiagnosticoComercial | null> {
  const { data, error } = await admin
    .from("commercial_diagnosis_reports")
    .select(SELECT_RELATORIO)
    .eq("organization_id", organizationId)
    .eq("id", reportId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normalizarRelatorioAnaliseIaDiagnosticoComercial(data) : null;
}

export async function salvarRelatorioAnaliseIaDiagnosticoComercial({
  admin,
  organizationId,
  userId,
  janela,
  analise,
}: {
  admin: SupabaseClient;
  organizationId: string;
  userId: string;
  janela: DiagnosticoComercialPayload["janela"];
  analise: AnaliseIaDiagnosticoComercialPayload;
}): Promise<RelatorioAnaliseIaDiagnosticoComercial> {
  const analiseParaSalvar: AnaliseIaDiagnosticoComercialPayload = { ...analise };
  delete analiseParaSalvar.relatorio;

  const { data, error } = await admin
    .from("commercial_diagnosis_reports")
    .insert({
      organization_id: organizationId,
      created_by_user_id: userId,
      from_at: janela.from,
      to_at: janela.to,
      period_days: janela.dias,
      analysis: analiseParaSalvar,
      prompt: analiseParaSalvar.prompt ?? null,
      llm_call_id: analiseParaSalvar.custo.call_id,
      provider: analiseParaSalvar.custo.provider,
      model: analiseParaSalvar.custo.model,
      cost_cents: analiseParaSalvar.custo.cost_cents,
      input_tokens: analiseParaSalvar.custo.input_tokens,
      output_tokens: analiseParaSalvar.custo.output_tokens,
      latency_ms: analiseParaSalvar.custo.latency_ms,
    })
    .select(SELECT_RELATORIO)
    .single();

  if (error) throw new Error(error.message);
  return normalizarRelatorioAnaliseIaDiagnosticoComercial(data);
}

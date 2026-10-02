/**
 * GET /api/v1/metrics/diagnostico-comercial
 *
 * Diagnostico objetivo para separar aquisicao de execucao comercial sem chamar
 * modelo ao abrir a tela. Lê apenas agregados/metadados: nunca `messages.body`.
 *
 * Escopo: manager+. A leitura usa service role porque junta fontes diferentes,
 * então TODAS as queries filtram `organization_id` resolvido da org ativa.
 * Read-only ⇒ sem audit.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  carregarDiagnosticoComercial,
  DIAGNOSTICO_COMERCIAL_MAX_DIAS,
  janelaDiagnosticoComercialSchema,
  janelaDiagnosticoInvalida,
  resolveJanelaDiagnosticoComercial,
} from "@/lib/metrics/diagnostico-comercial-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "metrics" });
  if (!authz.ok) return authz.response;

  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = janelaDiagnosticoComercialSchema.safeParse({
    from: req.nextUrl.searchParams.get("from") ?? undefined,
    to: req.nextUrl.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", t("Query inválida."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const janela = resolveJanelaDiagnosticoComercial(parsed.data);
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

  const orgId = authz.org.orgId;
  const fromIso = janela.from.toISOString();
  const toIso = janela.to.toISOString();
  const admin = createAdminClient();

  try {
    const payload = await carregarDiagnosticoComercial({
      admin,
      organizationId: orgId,
      fromIso,
      toIso,
    });

    return ok(payload, { requestId });
  } catch (erro) {
    return fail(
      "internal_error",
      erro instanceof Error ? erro.message : t("Não foi possível carregar o diagnóstico."),
      500,
      { requestId },
    );
  }
}

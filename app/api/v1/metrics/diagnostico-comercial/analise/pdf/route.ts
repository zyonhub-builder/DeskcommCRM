import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { renderDiagnosticoComercialAnalisePdf } from "@/lib/metrics/diagnostico-comercial-ai-pdf";
import {
  analiseIaDiagnosticoComercialPayloadSchema,
  type AnaliseIaDiagnosticoComercialPayload,
} from "@/lib/metrics/diagnostico-comercial-ai";
import { carregarRelatorioAnaliseIaDiagnosticoComercial } from "@/lib/metrics/diagnostico-comercial-reports";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const janelaPdfSchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .optional();

const bodySchema = z.union([
  z.object({ report_id: z.string().uuid() }),
  z.object({
    analise: analiseIaDiagnosticoComercialPayloadSchema,
    janela: janelaPdfSchema,
  }),
]);

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "metrics" });
  if (!authz.ok) return authz.response;

  const supportDenied = await requireSupportWrite(authz.org.orgId);
  if (supportDenied) return supportDenied;

  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return fail("validation_failed", t("Body inválido."), 422, {
      requestId,
      details: parsedBody.error.flatten().fieldErrors,
    });
  }

  try {
    let relatorioId: string | null = null;
    let analise: AnaliseIaDiagnosticoComercialPayload;
    let janela: { from?: string; to?: string } | undefined;

    if ("report_id" in parsedBody.data) {
      const relatorio = await carregarRelatorioAnaliseIaDiagnosticoComercial({
        admin: createAdminClient(),
        organizationId: authz.org.orgId,
        reportId: parsedBody.data.report_id,
      });

      if (!relatorio) {
        return fail("not_found", t("Relatório não encontrado."), 404, { requestId });
      }

      relatorioId = relatorio.id;
      analise = relatorio.analise;
      janela = relatorio.janela;
    } else {
      analise = parsedBody.data.analise;
      janela = parsedBody.data.janela;
    }

    const pdf = await renderDiagnosticoComercialAnalisePdf(analise, { janela });
    const date = new Date().toISOString().slice(0, 10);

    void audit({
      action: "metrics.diagnostico_comercial_pdf_downloaded",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: relatorioId ? "commercial_diagnosis_report" : "llm_call",
      resourceId: relatorioId ?? analise.custo.call_id,
      requestId,
      metadata: {
        purpose: analise.custo.purpose,
        report_id: relatorioId ?? analise.relatorio?.id ?? null,
        llm_call_id: analise.custo.call_id,
        provider: analise.custo.provider,
        model: analise.custo.model,
        cost_cents: analise.custo.cost_cents,
        from: janela?.from ?? null,
        to: janela?.to ?? null,
        format: "pdf",
      },
    });

    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="diagnostico-comercial-ia-${date}.pdf"`,
        "X-Request-Id": requestId,
      },
    });
  } catch (erro) {
    return fail(
      "internal_error",
      erro instanceof Error ? erro.message : t("Não foi possível gerar o PDF."),
      500,
      { requestId },
    );
  }
}

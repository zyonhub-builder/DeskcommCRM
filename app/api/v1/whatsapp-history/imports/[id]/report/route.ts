import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import {
  generateWhatsappHistoryAiReport,
  generateWhatsappHistoryReport,
  loadWhatsappHistoryReportsByImport,
  renderWhatsappHistoryReportMarkdown,
  WhatsappHistoryReportError,
} from "@/lib/whatsapp-history/report";
import { renderWhatsappHistoryReportPdf } from "@/lib/whatsapp-history/report-pdf";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  format: z.enum(["json", "md", "pdf"]).default("json"),
});
const bodySchema = z.object({
  mode: z.enum(["rules", "ai"]).default("rules"),
  ai_consent: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return fail("invalid_payload", "Importação inválida.", 400, { requestId });
  }
  const parsedQuery = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsedQuery.success) {
    return fail("invalid_payload", "Formato inválido.", 400, {
      requestId,
      details: parsedQuery.error.flatten(),
    });
  }

  const authz = await requireRole("manager", { requestId, resource: "whatsapp_history_report" });
  if (!authz.ok) return authz.response;

  try {
    const reports = await loadWhatsappHistoryReportsByImport(authz.org.orgId, [
      parsedParams.data.id,
    ]);
    const report = reports.get(parsedParams.data.id);
    if (!report) return fail("not_found", "Relatório não encontrado.", 404, { requestId });

    const auditDownload = (format: "md" | "pdf") =>
      void audit({
        action: "whatsapp_history.export_downloaded",
        actorUserId: authz.user.id,
        organizationId: authz.org.orgId,
        resourceType: "whatsapp_history_report",
        resourceId: report.id,
        requestId,
        metadata: {
          import_id: parsedParams.data.id,
          dataset: "ai_report",
          format,
        },
      });

    if (parsedQuery.data.format === "md") {
      auditDownload("md");

      const date = new Date().toISOString().slice(0, 10);
      return new Response(
        renderWhatsappHistoryReportMarkdown(report, { importId: parsedParams.data.id }),
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="whatsapp-history-${parsedParams.data.id.slice(0, 8)}-report-${date}.md"`,
            "X-Request-Id": requestId,
          },
        },
      );
    }
    if (parsedQuery.data.format === "pdf") {
      auditDownload("pdf");

      const date = new Date().toISOString().slice(0, 10);
      const pdf = await renderWhatsappHistoryReportPdf(report, { importId: parsedParams.data.id });
      const pdfBody = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
      return new Response(pdfBody, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="whatsapp-history-${parsedParams.data.id.slice(0, 8)}-report-${date}.pdf"`,
          "X-Request-Id": requestId,
        },
      });
    }
    return ok(report, { requestId });
  } catch (error) {
    return fail("database_error", "Não foi possível carregar o relatório.", 500, {
      requestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return fail("invalid_payload", "Importação inválida.", 400, { requestId });
  }
  const parsedBody = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return fail("invalid_body", "Parâmetros do relatório inválidos.", 422, {
      requestId,
      details: parsedBody.error.flatten(),
    });
  }

  const authz = await requireRole("manager", { requestId, resource: "whatsapp_history_report" });
  if (!authz.ok) return authz.response;
  const supportDenied = await requireSupportWrite(authz.org.orgId);
  if (supportDenied) return supportDenied;
  if (parsedBody.data.mode === "ai" && parsedBody.data.ai_consent !== true) {
    return fail(
      "unprocessable_entity",
      "Confirme o uso de IA externa para analisar a amostra sanitizada.",
      422,
      { requestId },
    );
  }

  try {
    const report =
      parsedBody.data.mode === "ai"
        ? await generateWhatsappHistoryAiReport({
            organizationId: authz.org.orgId,
            importId: parsedParams.data.id,
            actorUserId: authz.user.id,
            requestId,
          })
        : await generateWhatsappHistoryReport({
            organizationId: authz.org.orgId,
            importId: parsedParams.data.id,
            actorUserId: authz.user.id,
            requestId,
          });
    return ok(report, { requestId });
  } catch (error) {
    if (error instanceof WhatsappHistoryReportError) {
      if (error.code === "not_found") {
        return fail("not_found", error.message, 404, { requestId });
      }
      if (error.code === "not_ready") {
        return fail("invalid_state", error.message, 409, { requestId });
      }
      if (error.code === "not_enough_data") {
        return fail("invalid_payload", error.message, 422, { requestId });
      }
      if (error.code === "ai_unavailable") {
        return fail("unprocessable_entity", error.message, 422, { requestId });
      }
      if (error.code === "ai_output_invalid") {
        return fail("unprocessable_entity", error.message, 502, { requestId });
      }
    }
    return fail("database_error", "Não foi possível gerar o relatório.", 500, {
      requestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

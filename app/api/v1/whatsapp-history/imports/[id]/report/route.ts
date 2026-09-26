import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import {
  generateWhatsappHistoryReport,
  loadWhatsappHistoryReportsByImport,
  WhatsappHistoryReportError,
} from "@/lib/whatsapp-history/report";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return fail("invalid_payload", "Importação inválida.", 400, { requestId });
  }

  const authz = await requireRole("manager", { requestId, resource: "whatsapp_history_report" });
  if (!authz.ok) return authz.response;

  try {
    const reports = await loadWhatsappHistoryReportsByImport(authz.org.orgId, [parsedParams.data.id]);
    const report = reports.get(parsedParams.data.id);
    if (!report) return fail("not_found", "Relatório não encontrado.", 404, { requestId });
    return ok(report, { requestId });
  } catch (error) {
    return fail("database_error", "Não foi possível carregar o relatório.", 500, {
      requestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return fail("invalid_payload", "Importação inválida.", 400, { requestId });
  }

  const authz = await requireRole("manager", { requestId, resource: "whatsapp_history_report" });
  if (!authz.ok) return authz.response;
  const supportDenied = await requireSupportWrite(authz.org.orgId);
  if (supportDenied) return supportDenied;

  try {
    const report = await generateWhatsappHistoryReport({
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
    }
    return fail("database_error", "Não foi possível gerar o relatório.", 500, {
      requestId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

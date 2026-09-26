import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRole } from "@/lib/auth/require-role";
import { fetchHistoryTransportQr } from "@/lib/channels/history-transport";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return new NextResponse(null, { status: 400 });

  const authz = await requireRole("admin", { resource: "whatsapp_history_import" });
  if (!authz.ok) return new NextResponse(null, { status: authz.response.status });
  const supportDenied = await requireSupportWrite(authz.org.orgId);
  if (supportDenied) return new NextResponse(null, { status: supportDenied.status });

  const { data: row, error } = await createAdminClient()
    .from("whatsapp_history_imports")
    .select("transport_session_name, status")
    .eq("organization_id", authz.org.orgId)
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  if (error || !row) return new NextResponse(null, { status: 404 });
  const importRow = row as { transport_session_name: string; status: string };
  if (importRow.status !== "qr_pending") {
    return new NextResponse(null, {
      status: 409,
      headers: { "x-whatsapp-history-state": importRow.status },
    });
  }

  const upstream = await fetchHistoryTransportQr(importRow.transport_session_name);
  if (upstream.status === "not_configured") {
    return new NextResponse(null, { status: 503 });
  }

  if (!upstream.response.ok) {
    return new NextResponse(null, {
      status: upstream.response.status,
      headers: { "x-history-transport-status": String(upstream.response.status) },
    });
  }

  const contentType = upstream.response.headers.get("content-type") ?? "image/png";
  const body = await upstream.response.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": contentType, "cache-control": "no-store, max-age=0" },
  });
}

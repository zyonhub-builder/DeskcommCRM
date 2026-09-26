import { createHash, randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { ZAPSIGN_DOCUMENT_ENTITY_KIND, ZAPSIGN_DOCUMENT_SIGNED_EVENT } from "@/lib/zapsign/events";
import {
  ZAPSIGN_PROVIDER,
  aplicarWebhookZapsign,
  buscarIntegracaoPorWebhookToken,
  carregarCredencialZapsign,
  compararSegredoWebhook,
  tokenDoPayloadWebhook,
} from "@/lib/zapsign/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

const paramsSchema = z.object({
  token: z
    .string()
    .trim()
    .min(16)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
});
const payloadSchema = z.record(z.string(), z.unknown());

function eventoDoPayload(payload: Record<string, unknown>): string {
  for (const key of ["event", "event_type", "type", "status"]) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "unknown";
}

function externalId(evento: string, payload: Record<string, unknown>, rawBody: string): string {
  const token = tokenDoPayloadWebhook(payload);
  const signer =
    typeof payload.signer_token === "string"
      ? payload.signer_token
      : typeof payload.signer === "object" && payload.signer
        ? (payload.signer as Record<string, unknown>).token
        : null;
  if (token) return `${evento}:${token}:${typeof signer === "string" ? signer : "doc"}`;
  return `${evento}:body:${createHash("sha256").update(rawBody).digest("hex")}`;
}

function headersSemSegredo(req: NextRequest, headerSecreto: string): Record<string, string> {
  const segredo = headerSecreto.toLowerCase();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "authorization" || k === "cookie" || k === segredo) return;
    headers[key] = value;
  });
  return headers;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const parsedParams = paramsSchema.safeParse(await ctx.params);
  if (!parsedParams.success) {
    return fail("not_found", "webhook_not_found", 404, { requestId });
  }
  const { token } = parsedParams.data;

  const limite = await checkRateLimit(`zapsign:webhook:${token}`, 120, 60);
  if (!limite.allowed) {
    return fail("rate_limited", "rate_limited", 429, { requestId });
  }

  const db = createAdminClient();
  const integration = await buscarIntegracaoPorWebhookToken(db, token);
  if (!integration) {
    return fail("not_found", "webhook_not_found", 404, { requestId });
  }

  const cred = await carregarCredencialZapsign(db, integration.organization_id);
  if (!cred.ok) {
    await audit({
      action: "zapsign.webhook_invalid_signature",
      organizationId: integration.organization_id,
      resourceType: "zapsign_webhook",
      requestId,
      metadata: { reason: cred.erro },
    });
    return fail("internal_error", "webhook_secret_unavailable", cred.status ?? 500, { requestId });
  }

  const receivedSecret = req.headers.get(cred.data.webhookHeaderName);
  if (!compararSegredoWebhook(receivedSecret, cred.data.webhookSecret)) {
    await audit({
      action: "zapsign.webhook_invalid_signature",
      organizationId: integration.organization_id,
      resourceType: "zapsign_webhook",
      requestId,
      metadata: { reason: "invalid_header", header_name: cred.data.webhookHeaderName },
    });
    return fail("unauthenticated", "invalid_signature", 401, { requestId });
  }

  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    const validado = payloadSchema.safeParse(parsed);
    if (!validado.success) return fail("invalid_request", "invalid_json", 400, { requestId });
    payload = validado.data;
  } catch {
    return fail("invalid_request", "invalid_json", 400, { requestId });
  }

  const eventType = eventoDoPayload(payload);
  const ext = externalId(eventType, payload, rawBody);

  const { data: existing } = await db
    .from("webhook_events_log")
    .select("id")
    .eq("provider", ZAPSIGN_PROVIDER)
    .eq("organization_id", integration.organization_id)
    .eq("external_id", ext)
    .maybeSingle();
  if (existing) return ok({ accepted: true, idempotent: true }, { requestId });

  const { error: logError } = await db.from("webhook_events_log").insert({
    organization_id: integration.organization_id,
    provider: ZAPSIGN_PROVIDER,
    http_method: "POST",
    headers: headersSemSegredo(req, cred.data.webhookHeaderName),
    raw_body: rawBody,
    payload_parsed: payload,
    signature_header: `${cred.data.webhookHeaderName}: <redacted>`,
    valid_signature: true,
    event_type: eventType,
    external_id: ext,
    status: "received",
    attempts: 0,
  });
  if (logError) {
    logger.warn("zapsign webhook: falha ao arquivar entrega", {
      organization_id: integration.organization_id,
      code: logError.code,
      message: logError.message,
    });
  }

  const applied = await aplicarWebhookZapsign(db, {
    integration,
    eventType,
    payload,
  });
  if (!applied.ok) {
    return fail("internal_error", applied.erro, applied.status ?? 500, { requestId });
  }

  if (applied.data.signed_now && applied.data.document_id) {
    const { error: eventError } = await db.rpc(
      "emit_event" as never,
      {
        p_event_type: ZAPSIGN_DOCUMENT_SIGNED_EVENT,
        p_entity_kind: ZAPSIGN_DOCUMENT_ENTITY_KIND,
        p_entity_id: applied.data.document_id,
        p_payload: {
          document_id: applied.data.document_id,
          document_token: applied.data.document_token,
          lead_id: applied.data.lead_id,
          contact_id: applied.data.contact_id,
          status: applied.data.status,
          provider_event_type: eventType,
        },
        p_metadata: {
          provider: ZAPSIGN_PROVIDER,
          external_id: ext,
          request_id: requestId,
        },
        p_organization_id: integration.organization_id,
      } as never,
    );
    if (eventError) {
      logger.error("zapsign webhook: falha ao emitir evento interno", {
        organization_id: integration.organization_id,
        document_id: applied.data.document_id,
        event_type: ZAPSIGN_DOCUMENT_SIGNED_EVENT,
        error: (eventError as { message?: string }).message ?? String(eventError),
      });
    }
  }

  await audit({
    action: "zapsign.webhook_received",
    organizationId: integration.organization_id,
    resourceType: "zapsign_webhook",
    resourceId: applied.data.document_token ?? undefined,
    requestId,
    metadata: { event_type: eventType, external_id: ext },
  });

  return ok({ accepted: true }, { requestId });
}

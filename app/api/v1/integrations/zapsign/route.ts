import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ZAPSIGN_DEFAULT_WEBHOOK_HEADER,
  buscarIntegracaoZapsign,
  caminhoWebhookZapsign,
  salvarIntegracaoZapsign,
  testarTokenZapsign,
  validarWebhookHeaderName,
  visaoPublicaDaIntegracao,
} from "@/lib/zapsign/service";

export const dynamic = "force-dynamic";

const entradaSchema = z
  .object({
    api_token: z.string().trim().min(10).max(512),
    sandbox: z.boolean().default(false),
    webhook_header_name: z.string().trim().default(ZAPSIGN_DEFAULT_WEBHOOK_HEADER),
    webhook_secret: z.string().trim().min(16).max(512).optional(),
    testar: z.boolean().default(true),
  })
  .strict();

function absoluto(path: string | null): string | null {
  if (!path) return null;
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${path}`;
}

async function moduloOu404(requestId: string) {
  if (await moduloLigado(createAdminClient(), "zapsign")) return null;
  return fail("not_found", "Not found.", 404, { requestId });
}

function mensagemDeTeste(erro: string): string {
  return erro.length > 180 ? `${erro.slice(0, 177)}...` : erro;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const desligado = await moduloOu404(requestId);
  if (desligado) return desligado;

  const authz = await requireRole("viewer", { requestId, resource: "tenant_integrations" });
  if (!authz.ok) return authz.response;

  const row = await buscarIntegracaoZapsign(createAdminClient(), authz.org.orgId);
  const data = visaoPublicaDaIntegracao(row);
  return ok(
    {
      ...data,
      webhook_url: absoluto(data.webhook_path),
    },
    { requestId },
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const desligado = await moduloOu404(requestId);
  if (desligado) return desligado;

  const authz = await requireRole("admin", { requestId, resource: "tenant_integrations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const limite = await checkRateLimit(`zapsign:config:${authz.org.orgId}`, 12, 60);
  if (!limite.allowed) {
    return fail("rate_limited", t("Muitas alterações em pouco tempo. Tente de novo em instantes."), 429, {
      requestId,
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }

  const parsed = entradaSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;
  const headerName = validarWebhookHeaderName(input.webhook_header_name);
  if (!headerName) {
    return fail("validation_failed", t("Header de webhook inválido."), 422, { requestId });
  }

  let testOk: boolean | null = null;
  let testError: string | null = null;
  if (input.testar) {
    const teste = await testarTokenZapsign({
      apiToken: input.api_token,
      sandbox: input.sandbox,
    });
    testOk = teste.ok;
    testError = teste.ok ? null : mensagemDeTeste(teste.mensagem);
    if (!teste.ok) {
      await audit({
        action: "zapsign.configuration_failed",
        actorUserId: authz.user.id,
        organizationId: authz.org.orgId,
        resourceType: "tenant_integration",
        requestId,
        metadata: { reason: "test_failed", status: teste.status ?? null },
      });
      return fail("zapsign_error", t("A ZapSign recusou o token informado."), 422, {
        requestId,
        details: { status: teste.status ?? null },
      });
    }
  }

  const saved = await salvarIntegracaoZapsign(createAdminClient(), {
    organizationId: authz.org.orgId,
    apiToken: input.api_token,
    sandbox: input.sandbox,
    webhookHeaderName: headerName,
    webhookSecret: input.webhook_secret,
    testOk,
    testError,
  });
  if (!saved.ok) {
    return fail("zapsign_error", t("Não deu para salvar a integração ZapSign."), saved.status ?? 500, {
      requestId,
      details: { reason: saved.erro },
    });
  }

  const row = await buscarIntegracaoZapsign(createAdminClient(), authz.org.orgId);
  await audit({
    action: "zapsign.connected",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "tenant_integration",
    resourceId: row?.id,
    requestId,
    metadata: {
      sandbox: input.sandbox,
      tested: input.testar,
      webhook_header_name: headerName,
    },
  });

  return ok(
    {
      ...saved.data,
      webhook_url: absoluto(saved.data.webhook_path),
      webhook_path:
        row?.webhook_path_token !== undefined ? caminhoWebhookZapsign(row.webhook_path_token) : saved.data.webhook_path,
    },
    { status: 201, requestId },
  );
}

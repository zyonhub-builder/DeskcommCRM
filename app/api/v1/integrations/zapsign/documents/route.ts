import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarDocumentoZapsign } from "@/lib/zapsign/service";

export const dynamic = "force-dynamic";

const entradaSchema = z
  .object({
    nome: z.string().trim().min(1).max(255).optional(),
    tipo_arquivo: z.enum(["pdf", "docx"]).default("pdf"),
    url_documento: z.string().trim().url().max(2048),
    signatario_nome: z.string().trim().min(1).max(160),
    signatario_email: z.string().trim().email().max(255),
    enviar_email: z.boolean().default(true),
    date_limit_to_sign: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    external_id: z.string().trim().min(1).max(128).optional(),
    lead_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
  })
  .strict();

async function moduloOu404(requestId: string) {
  if (await moduloLigado(createAdminClient(), "zapsign")) return null;
  return fail("not_found", "Not found.", 404, { requestId });
}

function mensagemDeRecusa(motivo: string): string {
  switch (motivo) {
    case "zapsign_nao_configurado":
      return "A ZapSign ainda não está conectada para esta empresa.";
    case "document_source_required":
      return "Informe uma URL de PDF ou DOCX para criar o documento.";
    case "lead_not_found":
      return "Não encontrei esse lead nesta empresa.";
    case "contact_not_found":
      return "Não encontrei esse contato nesta empresa.";
    case "lead_contact_mismatch":
      return "O lead informado pertence a outro contato.";
    case "zapsign_api_error":
      return "A ZapSign recusou a criação. Revise o documento e o signatário.";
    default:
      return "Não foi possível criar o documento ZapSign.";
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const desligado = await moduloOu404(requestId);
  if (desligado) return desligado;

  const authz = await requireRole("admin", { requestId, resource: "zapsign_documents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const limite = await checkRateLimit(`zapsign:create:${authz.org.orgId}`, 20, 60);
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
  const resultado = await criarDocumentoZapsign(createAdminClient(), {
    organizationId: authz.org.orgId,
    actorKind: "user",
    actorRef: authz.user.id,
    source: "api",
    modo: "arquivo",
    nome: input.nome,
    urlPdf: input.tipo_arquivo === "pdf" ? input.url_documento : undefined,
    urlDocx: input.tipo_arquivo === "docx" ? input.url_documento : undefined,
    externalId: input.external_id ?? null,
    dateLimitToSign: input.date_limit_to_sign ?? null,
    signers: [
      {
        name: input.signatario_nome,
        email: input.signatario_email,
        send_automatic_email: input.enviar_email,
      },
    ],
    leadId: input.lead_id ?? null,
    contactId: input.contact_id ?? null,
  });

  if (!resultado.ok) {
    await audit({
      action: "zapsign.document_create_failed",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "zapsign_document",
      requestId,
      metadata: {
        reason: resultado.erro,
        tipo_arquivo: input.tipo_arquivo,
        enviar_email: input.enviar_email,
        linked: {
          lead: Boolean(input.lead_id),
          contact: Boolean(input.contact_id),
        },
      },
    });
    return fail("zapsign_error", t(mensagemDeRecusa(resultado.erro)), resultado.status ?? 500, {
      requestId,
    });
  }

  await audit({
    action: "zapsign.document_created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "zapsign_document",
    resourceId: String(resultado.data.documento.id),
    requestId,
    metadata: {
      source: "api",
      tipo_arquivo: input.tipo_arquivo,
      enviar_email: input.enviar_email,
      linked: {
        lead: Boolean(input.lead_id),
        contact: Boolean(input.contact_id),
      },
    },
  });

  return ok({ documento: resultado.data.documento }, { status: 201, requestId });
}

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
import { listarModelosDocumentoZapsign, salvarModeloDocumentoZapsign } from "@/lib/zapsign/service";

export const dynamic = "force-dynamic";

const entradaSchema = z
  .object({
    id: z.string().uuid().optional(),
    template_key: z.string().trim().min(1).max(80),
    nome: z.string().trim().min(1).max(160),
    descricao: z.string().trim().max(500).optional().nullable(),
    zapsign_template_id: z.string().trim().min(1).max(255),
    required_fields: z.array(z.string().trim().min(1).max(120)).max(80).default([]),
    template_data_defaults: z.record(z.string(), z.string()).default({}),
    agent_id: z.string().uuid().optional().nullable(),
    is_active: z.boolean().default(true),
    is_default: z.boolean().default(false),
    default_for_agent: z.boolean().default(false),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.default_for_agent && !input.agent_id) {
      ctx.addIssue({
        code: "custom",
        path: ["agent_id"],
        message: "Escolha o agente para usar este modelo como padrão.",
      });
    }
  });

async function moduloOu404(requestId: string) {
  if (await moduloLigado(createAdminClient(), "zapsign")) return null;
  return fail("not_found", "Not found.", 404, { requestId });
}

function mensagemDeRecusa(motivo: string): string {
  switch (motivo) {
    case "template_key_invalid":
      return "A chave do modelo precisa começar com letra ou número e usar apenas letras, números, hífen ou sublinhado.";
    case "template_key_conflict":
      return "Já existe um modelo ZapSign com esta chave.";
    case "default_conflict":
      return "Já existe outro modelo padrão da empresa.";
    case "agent_default_conflict":
      return "Este agente já tem outro modelo padrão ativo.";
    case "agent_not_found":
      return "Não encontrei esse agente nesta empresa.";
    default:
      return "Não foi possível salvar o modelo ZapSign.";
  }
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const desligado = await moduloOu404(requestId);
  if (desligado) return desligado;

  const authz = await requireRole("admin", { requestId, resource: "zapsign_document_templates" });
  if (!authz.ok) return authz.response;

  const modelos = await listarModelosDocumentoZapsign(createAdminClient(), authz.org.orgId);
  return ok(modelos, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const desligado = await moduloOu404(requestId);
  if (desligado) return desligado;

  const authz = await requireRole("admin", { requestId, resource: "zapsign_document_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const limite = await checkRateLimit(`zapsign:templates:${authz.org.orgId}`, 30, 60);
  if (!limite.allowed) {
    return fail(
      "rate_limited",
      t("Muitas alterações em pouco tempo. Tente de novo em instantes."),
      429,
      {
        requestId,
      },
    );
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
  const resultado = await salvarModeloDocumentoZapsign(createAdminClient(), {
    id: input.id ?? null,
    organizationId: authz.org.orgId,
    agentId: input.agent_id ?? null,
    templateKey: input.template_key,
    nome: input.nome,
    descricao: input.descricao ?? null,
    zapsignTemplateId: input.zapsign_template_id,
    requiredFields: input.required_fields,
    templateDataDefaults: input.template_data_defaults,
    isActive: input.is_active,
    isDefault: input.is_default,
    defaultForAgent: input.default_for_agent,
  });

  if (!resultado.ok) {
    await audit({
      action: "zapsign.template_save_failed",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "zapsign_document_template",
      resourceId: input.id,
      requestId,
      metadata: {
        reason: resultado.erro,
        template_key: input.template_key,
        linked_agent: Boolean(input.agent_id),
        is_default: input.is_default,
        default_for_agent: input.default_for_agent,
      },
    });
    return fail(
      "zapsign_template_error",
      t(mensagemDeRecusa(resultado.erro)),
      resultado.status ?? 500,
      {
        requestId,
      },
    );
  }

  await audit({
    action: input.id ? "zapsign.template_updated" : "zapsign.template_created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "zapsign_document_template",
    resourceId: resultado.data.id,
    requestId,
    metadata: {
      template_key: resultado.data.template_key,
      linked_agent: Boolean(resultado.data.agent_id),
      is_active: resultado.data.is_active,
      is_default: resultado.data.is_default,
      default_for_agent: resultado.data.default_for_agent,
      required_fields_count: resultado.data.required_fields.length,
    },
  });

  return ok({ modelo: resultado.data }, { status: input.id ? 200 : 201, requestId });
}

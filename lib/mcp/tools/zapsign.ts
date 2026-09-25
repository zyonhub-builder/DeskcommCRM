/**
 * Capacidades de assinatura eletrônica via ZapSign.
 *
 * A IA não recebe a credencial e nunca escolhe organização: o token cifrado vem
 * de `tenant_integrations`, a organização vem de `ctx.organizationId`, e a
 * criação persiste o espelho local em `zapsign_documents` para fechar o laço
 * quando o webhook voltar.
 */
import { z } from "zod";

import {
  criarDocumentoZapsign,
  listarDocumentosZapsign,
  obterDocumentoZapsign,
} from "@/lib/zapsign/service";

import type { McpContext, McpToolDefinition } from "../types";

const signatarioSchema = z.record(z.string(), z.unknown());
const opcoesLivresSchema = z.record(z.string(), z.unknown());

const uuidOpcional = z.string().uuid().optional();

function flagLigado(valor: unknown): boolean {
  return valor === true || valor === "true";
}

function actorKind(ctx: McpContext): "user" | "ai" | "system" {
  if (ctx.actor.type === "user") return "user";
  if (ctx.actor.type === "ai_agent") return "ai";
  return "system";
}

function contemEnvioAutomatico(valor: unknown): boolean {
  if (Array.isArray(valor)) return valor.some((item) => contemEnvioAutomatico(item));
  if (!valor || typeof valor !== "object") return false;
  const obj = valor as Record<string, unknown>;
  if (flagLigado(obj.send_automatic_email) || flagLigado(obj.send_automatic_whatsapp)) {
    return true;
  }
  return Object.values(obj).some((item) => contemEnvioAutomatico(item));
}

function resumoSignatarios(signers: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(signers)) return undefined;
  return {
    quantidade: signers.length,
    envio_automatico: contemEnvioAutomatico(signers),
  };
}

function redigirObjeto(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map((item) => redigirObjeto(item));
  if (!valor || typeof valor !== "object") return valor;
  const redigido: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    const k = chave.toLowerCase();
    if (
      k.includes("email") ||
      k.includes("phone") ||
      k.includes("telefone") ||
      k.includes("cpf") ||
      k.includes("name") ||
      k.includes("nome") ||
      k.includes("base64") ||
      k.includes("token")
    ) {
      redigido[chave] = "<redacted>";
    } else {
      redigido[chave] = redigirObjeto(v);
    }
  }
  return redigido;
}

export function redigirCriacaoZapsignParaAuditoria(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const redigido = { ...args };
  if ("base64_pdf" in redigido) redigido.base64_pdf = "<redacted>";
  if ("signers" in redigido) redigido.signers = resumoSignatarios(redigido.signers) ?? "<redacted>";
  if ("template_data" in redigido) {
    const data = redigido.template_data;
    redigido.template_data =
      data && typeof data === "object"
        ? { campos: Object.keys(data as Record<string, unknown>).sort() }
        : "<redacted>";
  }
  if ("raw_options" in redigido) redigido.raw_options = redigirObjeto(redigido.raw_options);
  return redigido;
}

function motivoDaCriacao(resultado: unknown): string | null {
  if (!resultado || typeof resultado !== "object") return null;
  const r = resultado as { criado?: unknown; motivo?: unknown };
  return r.criado === false && typeof r.motivo === "string" ? r.motivo : null;
}

function mensagemDeRecusa(motivo: string): string {
  switch (motivo) {
    case "confirmacao_necessaria":
      return "o pedido pode disparar convite fora do sistema. Confirme explicitamente antes de criar.";
    case "zapsign_nao_configurado":
      return "a ZapSign ainda não está conectada para esta empresa.";
    case "template_id_required":
      return "para criar por modelo, informe o modelo que a ZapSign deve usar.";
    case "document_source_required":
      return "para criar por arquivo, informe exatamente um arquivo: link PDF, link DOCX ou PDF em base64.";
    case "lead_not_found":
      return "não encontrei esse negócio nesta empresa.";
    case "contact_not_found":
      return "não encontrei esse cliente nesta empresa.";
    case "lead_contact_mismatch":
      return "o negócio informado pertence a outro cliente. Use o cliente do próprio negócio.";
    case "zapsign_api_error":
      return "a ZapSign recusou a criação. Revise os campos do documento e tente novamente.";
    default:
      return "não foi possível criar o documento de assinatura.";
  }
}

// ---------------------------------------------------------------------------
// crm_create_zapsign_document
// ---------------------------------------------------------------------------

const criarInputShape = {
  modo: z.enum(["arquivo", "modelo"]).optional().default("modelo"),
  nome: z.string().trim().min(1).max(255).optional(),
  template_id: z.string().trim().min(1).max(255).optional(),
  template_data: z.record(z.string(), z.string()).optional(),
  url_pdf: z.string().trim().url().optional(),
  url_docx: z.string().trim().url().optional(),
  base64_pdf: z.string().trim().min(10).max(15_000_000).optional(),
  lang: z.enum(["pt-br", "en", "es"]).optional(),
  external_id: z.string().trim().min(1).max(128).optional(),
  folder_path: z.string().trim().min(1).max(255).optional(),
  date_limit_to_sign: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  signers: z.array(signatarioSchema).max(20).optional(),
  lead_id: uuidOpcional,
  contact_id: uuidOpcional,
  raw_options: opcoesLivresSchema.optional(),
  confirmou_envio_externo: z.boolean().optional().default(false),
};

export const crmCreateZapsignDocument: McpToolDefinition<typeof criarInputShape> = {
  name: "crm_create_zapsign_document",
  description:
    "Cria um documento na ZapSign para assinatura. Use quando a pessoa aceitou gerar contrato, " +
    "proposta ou termo. Prefira vincular `lead_id` ou `contact_id` para a assinatura aparecer no " +
    "histórico certo. Se `signers` ou `raw_options` ativarem envio automático por e-mail ou WhatsApp, " +
    "só chame com `confirmou_envio_externo: true` depois de confirmar que a criação pode disparar " +
    "convite fora do CRM. Para modelo, informe `template_id`; para arquivo, informe exatamente um " +
    "entre `url_pdf`, `url_docx` e `base64_pdf`. Não invente dados de signatário.",
  inputSchema: criarInputShape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  redigirParaAuditoria: redigirCriacaoZapsignParaAuditoria,
  motivoDoVazio: motivoDaCriacao,
  handler: async (input, ctx) => {
    const disparaEnvio = contemEnvioAutomatico(input.signers) || contemEnvioAutomatico(input.raw_options);
    if (disparaEnvio && !input.confirmou_envio_externo) {
      return {
        criado: false,
        motivo: "confirmacao_necessaria",
        mensagem: mensagemDeRecusa("confirmacao_necessaria"),
      };
    }

    const resultado = await criarDocumentoZapsign(ctx.supabase, {
      organizationId: ctx.organizationId,
      actorKind: actorKind(ctx),
      actorRef: ctx.actor.id,
      source: "mcp",
      modo: input.modo,
      nome: input.nome,
      templateId: input.template_id,
      templateData: input.template_data,
      urlPdf: input.url_pdf,
      urlDocx: input.url_docx,
      base64Pdf: input.base64_pdf,
      lang: input.lang,
      externalId: input.external_id ?? null,
      folderPath: input.folder_path ?? null,
      dateLimitToSign: input.date_limit_to_sign ?? null,
      signers: input.signers,
      leadId: input.lead_id ?? null,
      contactId: input.contact_id ?? null,
      rawOptions: input.raw_options,
    });

    if (!resultado.ok) {
      return {
        criado: false,
        motivo: resultado.erro,
        mensagem: mensagemDeRecusa(resultado.erro),
        status: resultado.status ?? null,
      };
    }

    return {
      criado: true,
      documento: resultado.data.documento,
    };
  },
};

// ---------------------------------------------------------------------------
// crm_get_zapsign_document
// ---------------------------------------------------------------------------

const obterInputShape = {
  token: z.string().trim().min(1).max(255),
  consultar_remoto: z.boolean().optional().default(false),
};

export const crmGetZapsignDocument: McpToolDefinition<typeof obterInputShape> = {
  name: "crm_get_zapsign_document",
  description:
    "Consulta um documento da ZapSign pelo token do documento. Sem `consultar_remoto`, lê só o " +
    "espelho local atualizado pelos eventos recebidos. Use `consultar_remoto: true` quando precisar " +
    "confirmar o estado direto na ZapSign; esta consulta não altera o registro local.",
  inputSchema: obterInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const resultado = await obterDocumentoZapsign(ctx.supabase, {
      organizationId: ctx.organizationId,
      token: input.token,
      consultarRemoto: input.consultar_remoto,
    });
    if (!resultado.ok) {
      return {
        encontrado: false,
        motivo: resultado.erro,
        mensagem:
          resultado.erro === "zapsign_nao_configurado"
            ? "a ZapSign ainda não está conectada para esta empresa."
            : "não foi possível consultar este documento agora.",
        status: resultado.status ?? null,
      };
    }
    return {
      encontrado: resultado.data.local !== null,
      ...resultado.data,
    };
  },
};

// ---------------------------------------------------------------------------
// crm_list_zapsign_documents
// ---------------------------------------------------------------------------

const listarInputShape = {
  status: z.string().trim().min(1).max(80).optional(),
  lead_id: uuidOpcional,
  contact_id: uuidOpcional,
  limite: z.number().int().min(1).max(50).optional().default(20),
};

export const crmListZapsignDocuments: McpToolDefinition<typeof listarInputShape> = {
  name: "crm_list_zapsign_documents",
  description:
    "Lista documentos de assinatura da empresa, do mais recente para o mais antigo. Pode filtrar por " +
    "`status`, `lead_id` ou `contact_id`. Use antes de dizer se um contrato já foi assinado, recusado " +
    "ou ainda está pendente.",
  inputSchema: listarInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) =>
    listarDocumentosZapsign(ctx.supabase, {
      organizationId: ctx.organizationId,
      status: input.status,
      leadId: input.lead_id,
      contactId: input.contact_id,
      limite: input.limite,
    }),
};

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ZapSignApiError, ZapSignClient, type ZapSignDocumentSummary, zapsignBaseUrl } from "./client";

export const ZAPSIGN_PROVIDER = "zapsign";
export const ZAPSIGN_DEFAULT_WEBHOOK_HEADER = "X-ZapSign-Webhook-Secret";
export const ZAPSIGN_WEBHOOK_EVENTS = [
  "doc_created",
  "doc_signed",
  "doc_refused",
  "doc_viewed",
  "doc_expired",
] as const;

export type IntegrationRow = {
  id: string;
  organization_id: string;
  oauth_access_token_encrypted: unknown;
  webhook_secret_encrypted: unknown;
  webhook_path_token: string;
  status: string;
  status_reason: string | null;
  store_metadata: Record<string, unknown> | null;
  last_health_check_at: string | null;
  updated_at: string | null;
};

type Resultado<T> = { ok: true; data: T } | { ok: false; erro: string; status?: number };

export type ZapsignIntegrationPublica = {
  connected: boolean;
  status: string | null;
  status_reason: string | null;
  sandbox: boolean;
  base_url: string;
  api_token_last4: string | null;
  webhook_path: string | null;
  webhook_header_name: string;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  last_health_check_at: string | null;
};

export type ConfigurarZapsignInput = {
  organizationId: string;
  apiToken: string;
  sandbox: boolean;
  baseUrl?: string;
  webhookHeaderName: string;
  webhookSecret?: string;
  testOk: boolean | null;
  testError: string | null;
};

export type CriarDocumentoZapsignInput = {
  organizationId: string;
  actorKind: "user" | "ai" | "system";
  actorRef?: string | null;
  source: "api" | "mcp";
  modo: "arquivo" | "modelo";
  nome?: string;
  templateId?: string;
  templateData?: Record<string, string>;
  urlPdf?: string;
  urlDocx?: string;
  base64Pdf?: string;
  lang?: "pt-br" | "en" | "es";
  externalId?: string | null;
  folderPath?: string | null;
  dateLimitToSign?: string | null;
  signers?: unknown[];
  leadId?: string | null;
  contactId?: string | null;
  rawOptions?: Record<string, unknown>;
};

type CredencialZapsign = {
  integration: IntegrationRow;
  apiToken: string;
  webhookSecret: string;
  webhookHeaderName: string;
  sandbox: boolean;
  baseUrl: string;
};

function metadata(row: Pick<IntegrationRow, "store_metadata"> | null | undefined): Record<string, unknown> {
  return row?.store_metadata && typeof row.store_metadata === "object" && !Array.isArray(row.store_metadata)
    ? row.store_metadata
    : {};
}

function boolMeta(meta: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof meta[key] === "boolean" ? meta[key] : fallback;
}

function stringMeta(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function last4(token: string): string {
  return token.slice(-4);
}

export function gerarWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

export function validarWebhookHeaderName(nome: string): string | null {
  const normalizado = nome.trim();
  if (!/^[A-Za-z][A-Za-z0-9-]{2,79}$/.test(normalizado)) return null;
  const baixo = normalizado.toLowerCase();
  if (baixo === "authorization" || baixo === "cookie" || baixo.startsWith("x-forwarded-")) {
    return null;
  }
  return normalizado;
}

export function compararSegredoWebhook(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function caminhoWebhookZapsign(pathToken: string): string {
  return `/api/v1/webhooks/zapsign/${pathToken}`;
}

export function visaoPublicaDaIntegracao(row: IntegrationRow | null): ZapsignIntegrationPublica {
  if (!row) {
    return {
      connected: false,
      status: null,
      status_reason: null,
      sandbox: false,
      base_url: zapsignBaseUrl({ sandbox: false }),
      api_token_last4: null,
      webhook_path: null,
      webhook_header_name: ZAPSIGN_DEFAULT_WEBHOOK_HEADER,
      last_test_ok: null,
      last_test_error: null,
      last_health_check_at: null,
    };
  }
  const meta = metadata(row);
  const sandbox = boolMeta(meta, "sandbox", false);
  return {
    connected: row.status !== "disconnected",
    status: row.status,
    status_reason: row.status_reason,
    sandbox,
    base_url: stringMeta(meta, "base_url") ?? zapsignBaseUrl({ sandbox }),
    api_token_last4: stringMeta(meta, "api_token_last4"),
    webhook_path: caminhoWebhookZapsign(row.webhook_path_token),
    webhook_header_name: stringMeta(meta, "webhook_header_name") ?? ZAPSIGN_DEFAULT_WEBHOOK_HEADER,
    last_test_ok: typeof meta.last_test_ok === "boolean" ? meta.last_test_ok : null,
    last_test_error: stringMeta(meta, "last_test_error"),
    last_health_check_at: row.last_health_check_at,
  };
}

export async function buscarIntegracaoZapsign(
  db: SupabaseClient,
  organizationId: string,
): Promise<IntegrationRow | null> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select(
      "id, organization_id, oauth_access_token_encrypted, webhook_secret_encrypted, webhook_path_token, status, status_reason, store_metadata, last_health_check_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("provider", ZAPSIGN_PROVIDER)
    .maybeSingle();
  if (error) throw new Error(`zapsign_integracao_busca_falhou: ${error.message}`);
  return (data ?? null) as IntegrationRow | null;
}

async function cifrar(db: SupabaseClient, plaintext: string): Promise<Resultado<unknown>> {
  const { data, error } = await db.rpc("fn_encrypt_oauth", { plaintext });
  if (error || !data) {
    return { ok: false, erro: "encrypt_failed", status: 500 };
  }
  return { ok: true, data };
}

async function decifrar(db: SupabaseClient, ciphertext: unknown): Promise<Resultado<string>> {
  const { data, error } = await db.rpc("fn_decrypt_oauth", { ciphertext });
  if (error || !data || typeof data !== "string") {
    return { ok: false, erro: "decrypt_failed", status: 500 };
  }
  return { ok: true, data };
}

export async function salvarIntegracaoZapsign(
  db: SupabaseClient,
  input: ConfigurarZapsignInput,
): Promise<Resultado<ZapsignIntegrationPublica & { webhook_secret_once: string }>> {
  const headerName = validarWebhookHeaderName(input.webhookHeaderName);
  if (!headerName) return { ok: false, erro: "webhook_header_invalido", status: 422 };

  const tokenEnc = await cifrar(db, input.apiToken);
  if (!tokenEnc.ok) return tokenEnc;

  const webhookSecret = input.webhookSecret?.trim() || gerarWebhookSecret();
  const webhookEnc = await cifrar(db, webhookSecret);
  if (!webhookEnc.ok) return webhookEnc;

  const existente = await buscarIntegracaoZapsign(db, input.organizationId);
  const metaAnterior = metadata(existente);
  const agora = new Date().toISOString();
  const sandbox = input.sandbox;
  const baseUrl = zapsignBaseUrl({ baseUrl: input.baseUrl, sandbox });
  const storeMetadata = {
    ...metaAnterior,
    sandbox,
    base_url: baseUrl,
    api_token_last4: last4(input.apiToken),
    webhook_header_name: headerName,
    configured_at: agora,
    last_test_ok: input.testOk,
    last_test_error: input.testError,
  };

  const { data, error } = await db
    .from("tenant_integrations")
    .upsert(
      {
        organization_id: input.organizationId,
        provider: ZAPSIGN_PROVIDER,
        oauth_access_token_encrypted: tokenEnc.data,
        scopes: [],
        status: input.testOk === false ? "error" : "healthy",
        status_reason: input.testError,
        store_metadata: storeMetadata,
        webhook_path_token: existente?.webhook_path_token ?? gerarWebhookSecret(),
        webhook_secret_encrypted: webhookEnc.data,
        webhook_subscriptions: {
          events: ZAPSIGN_WEBHOOK_EVENTS,
          header_name: headerName,
        },
        last_health_check_at: input.testOk === null ? null : agora,
        last_sync_at: agora,
      },
      { onConflict: "organization_id,provider" },
    )
    .select(
      "id, organization_id, oauth_access_token_encrypted, webhook_secret_encrypted, webhook_path_token, status, status_reason, store_metadata, last_health_check_at, updated_at",
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      erro: error?.code === "23514" ? "provider_nao_habilitado_no_schema" : "db_write_failed",
      status: 500,
    };
  }

  return {
    ok: true,
    data: {
      ...visaoPublicaDaIntegracao(data as IntegrationRow),
      webhook_secret_once: webhookSecret,
    },
  };
}

export async function carregarCredencialZapsign(
  db: SupabaseClient,
  organizationId: string,
): Promise<Resultado<CredencialZapsign>> {
  const integration = await buscarIntegracaoZapsign(db, organizationId);
  if (!integration || integration.status === "disconnected") {
    return { ok: false, erro: "zapsign_nao_configurado", status: 409 };
  }
  const token = await decifrar(db, integration.oauth_access_token_encrypted);
  if (!token.ok) return token;
  const secret = await decifrar(db, integration.webhook_secret_encrypted);
  if (!secret.ok) return secret;
  const meta = metadata(integration);
  const sandbox = boolMeta(meta, "sandbox", false);
  return {
    ok: true,
    data: {
      integration,
      apiToken: token.data,
      webhookSecret: secret.data,
      webhookHeaderName: stringMeta(meta, "webhook_header_name") ?? ZAPSIGN_DEFAULT_WEBHOOK_HEADER,
      sandbox,
      baseUrl: stringMeta(meta, "base_url") ?? zapsignBaseUrl({ sandbox }),
    },
  };
}

export async function testarTokenZapsign(input: {
  apiToken: string;
  sandbox: boolean;
  baseUrl?: string;
}): Promise<{ ok: true } | { ok: false; mensagem: string; status?: number }> {
  try {
    await new ZapSignClient(input).testToken();
    return { ok: true };
  } catch (error) {
    if (error instanceof ZapSignApiError) {
      return { ok: false, mensagem: error.message, status: error.status };
    }
    return { ok: false, mensagem: error instanceof Error ? error.message : "zapsign_test_failed" };
  }
}

async function validarVinculos(
  db: SupabaseClient,
  input: { organizationId: string; leadId?: string | null; contactId?: string | null },
): Promise<Resultado<{ leadId: string | null; contactId: string | null }>> {
  let contactId = input.contactId ?? null;
  if (input.leadId) {
    const { data, error } = await db
      .from("crm_leads")
      .select("id, contact_id")
      .eq("organization_id", input.organizationId)
      .eq("id", input.leadId)
      .maybeSingle();
    if (error) return { ok: false, erro: "lead_lookup_failed", status: 500 };
    if (!data) return { ok: false, erro: "lead_not_found", status: 404 };
    const leadContact = typeof data.contact_id === "string" ? data.contact_id : null;
    if (contactId && contactId !== leadContact) {
      return { ok: false, erro: "lead_contact_mismatch", status: 422 };
    }
    contactId = contactId ?? leadContact;
  }
  if (contactId) {
    const { data, error } = await db
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("id", contactId)
      .maybeSingle();
    if (error) return { ok: false, erro: "contact_lookup_failed", status: 500 };
    if (!data) return { ok: false, erro: "contact_not_found", status: 404 };
  }
  return { ok: true, data: { leadId: input.leadId ?? null, contactId } };
}

function templateDataParaZapSign(
  data: Record<string, string> | undefined,
): Array<{ de: string; para: string }> | undefined {
  if (!data) return undefined;
  return Object.entries(data).map(([de, para]) => ({ de, para }));
}

function montarPayloadCriacao(input: CriarDocumentoZapsignInput): Resultado<Record<string, unknown>> {
  const comum: Record<string, unknown> = {
    ...(input.rawOptions ?? {}),
    ...(input.nome ? { name: input.nome } : {}),
    ...(input.lang ? { lang: input.lang } : {}),
    ...(input.externalId ? { external_id: input.externalId } : {}),
    ...(input.folderPath ? { folder_path: input.folderPath } : {}),
    ...(input.dateLimitToSign ? { date_limit_to_sign: input.dateLimitToSign } : {}),
    ...(input.signers ? { signers: input.signers } : {}),
  };

  if (input.modo === "modelo") {
    if (!input.templateId) return { ok: false, erro: "template_id_required", status: 422 };
    const templateData = templateDataParaZapSign(input.templateData);
    return {
      ok: true,
      data: {
        ...comum,
        template_id: input.templateId,
        ...(templateData ? { data: templateData } : {}),
      },
    };
  }

  const fontes = [input.urlPdf, input.urlDocx, input.base64Pdf].filter((v) => v && v.length > 0);
  if (fontes.length !== 1) return { ok: false, erro: "document_source_required", status: 422 };
  return {
    ok: true,
    data: {
      ...comum,
      ...(input.urlPdf ? { url_pdf: input.urlPdf } : {}),
      ...(input.urlDocx ? { url_docx: input.urlDocx } : {}),
      ...(input.base64Pdf ? { base64_pdf: input.base64Pdf } : {}),
    },
  };
}

function documentoLocal(row: Record<string, unknown>) {
  return {
    id: row.id,
    token: row.external_token,
    open_id: row.external_open_id,
    external_id: row.external_id,
    name: row.name,
    status: row.status,
    lead_id: row.lead_id,
    contact_id: row.contact_id,
    signers: row.signers,
    last_event_type: row.last_event_type,
    last_event_at: row.last_event_at,
    signed_at: row.signed_at,
    refused_at: row.refused_at,
    expired_at: row.expired_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function criarDocumentoZapsign(
  db: SupabaseClient,
  input: CriarDocumentoZapsignInput,
): Promise<Resultado<{ documento: ReturnType<typeof documentoLocal>; resposta_zapsign: ZapSignDocumentSummary }>> {
  const cred = await carregarCredencialZapsign(db, input.organizationId);
  if (!cred.ok) return cred;

  const vinculos = await validarVinculos(db, {
    organizationId: input.organizationId,
    leadId: input.leadId,
    contactId: input.contactId,
  });
  if (!vinculos.ok) return vinculos;

  const payload = montarPayloadCriacao(input);
  if (!payload.ok) return payload;

  let resposta: ZapSignDocumentSummary;
  try {
    const client = new ZapSignClient({
      apiToken: cred.data.apiToken,
      baseUrl: cred.data.baseUrl,
      sandbox: cred.data.sandbox,
    });
    resposta =
      input.modo === "modelo"
        ? await client.createDocumentFromTemplate(payload.data)
        : await client.createDocument(payload.data);
  } catch (error) {
    if (error instanceof ZapSignApiError) {
      return { ok: false, erro: "zapsign_api_error", status: error.status };
    }
    return { ok: false, erro: "zapsign_request_failed", status: 502 };
  }

  const token = typeof resposta.token === "string" ? resposta.token : "";
  if (!token) return { ok: false, erro: "zapsign_response_without_token", status: 502 };

  const row = {
    organization_id: input.organizationId,
    integration_id: cred.data.integration.id,
    lead_id: vinculos.data.leadId,
    contact_id: vinculos.data.contactId,
    external_token: token,
    external_open_id: resposta.open_id === undefined ? null : String(resposta.open_id),
    external_id:
      typeof resposta.external_id === "string"
        ? resposta.external_id
        : (input.externalId ?? null),
    name: typeof resposta.name === "string" ? resposta.name : (input.nome ?? token),
    status: typeof resposta.status === "string" ? resposta.status : "pending",
    source: input.source,
    created_by_kind: input.actorKind,
    created_by_ref: input.actorRef ?? null,
    signers: Array.isArray(resposta.signers) ? resposta.signers : (input.signers ?? []),
    provider_payload: resposta,
  };

  const { data, error } = await db
    .from("zapsign_documents")
    .upsert(row, { onConflict: "organization_id,external_token" })
    .select("*")
    .single();
  if (error || !data) return { ok: false, erro: "zapsign_document_persist_failed", status: 500 };

  return {
    ok: true,
    data: { documento: documentoLocal(data as Record<string, unknown>), resposta_zapsign: resposta },
  };
}

export async function listarDocumentosZapsign(
  db: SupabaseClient,
  input: {
    organizationId: string;
    status?: string;
    leadId?: string;
    contactId?: string;
    limite?: number;
  },
): Promise<{ documentos: ReturnType<typeof documentoLocal>[] }> {
  let q = db
    .from("zapsign_documents")
    .select("*")
    .eq("organization_id", input.organizationId)
    .order("updated_at", { ascending: false })
    .limit(input.limite ?? 20);
  if (input.status) q = q.eq("status", input.status);
  if (input.leadId) q = q.eq("lead_id", input.leadId);
  if (input.contactId) q = q.eq("contact_id", input.contactId);
  const { data, error } = await q;
  if (error) throw new Error(`zapsign_list_failed: ${error.message}`);
  return { documentos: (data ?? []).map((d) => documentoLocal(d as Record<string, unknown>)) };
}

export async function obterDocumentoZapsign(
  db: SupabaseClient,
  input: {
    organizationId: string;
    token: string;
    consultarRemoto?: boolean;
  },
): Promise<Resultado<{ local: ReturnType<typeof documentoLocal> | null; remoto?: ZapSignDocumentSummary }>> {
  const { data, error } = await db
    .from("zapsign_documents")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("external_token", input.token)
    .maybeSingle();
  if (error) return { ok: false, erro: "zapsign_document_lookup_failed", status: 500 };

  let remoto: ZapSignDocumentSummary | undefined;
  if (input.consultarRemoto) {
    const cred = await carregarCredencialZapsign(db, input.organizationId);
    if (!cred.ok) return cred;
    try {
      remoto = await new ZapSignClient({
        apiToken: cred.data.apiToken,
        baseUrl: cred.data.baseUrl,
        sandbox: cred.data.sandbox,
      }).getDocument(input.token);
    } catch (e) {
      if (e instanceof ZapSignApiError) return { ok: false, erro: "zapsign_api_error", status: e.status };
      return { ok: false, erro: "zapsign_request_failed", status: 502 };
    }
  }

  return {
    ok: true,
    data: {
      local: data ? documentoLocal(data as Record<string, unknown>) : null,
      ...(remoto ? { remoto } : {}),
    },
  };
}

export function tokenDoPayloadWebhook(payload: Record<string, unknown>): string | null {
  const direto = payload.token ?? payload.doc_token;
  if (typeof direto === "string" && direto.trim()) return direto;
  const doc = payload.document;
  if (doc && typeof doc === "object") {
    const token = (doc as Record<string, unknown>).token;
    if (typeof token === "string" && token.trim()) return token;
  }
  return null;
}

export function statusPorEventoZapsign(evento: string, payload: Record<string, unknown>): string {
  if (typeof payload.status === "string" && payload.status.trim()) return payload.status;
  switch (evento) {
    case "doc_signed":
      return "signed";
    case "doc_refused":
      return "refused";
    case "doc_expired":
      return "expired";
    case "doc_created":
      return "pending";
    default:
      return "pending";
  }
}

export async function aplicarWebhookZapsign(
  db: SupabaseClient,
  input: {
    integration: IntegrationRow;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<Resultado<{ document_token: string | null }>> {
  const token = tokenDoPayloadWebhook(input.payload);
  if (!token) return { ok: true, data: { document_token: null } };

  const agora = new Date().toISOString();
  const status = statusPorEventoZapsign(input.eventType, input.payload);
  const patch: Record<string, unknown> = {
    organization_id: input.integration.organization_id,
    integration_id: input.integration.id,
    external_token: token,
    external_open_id: input.payload.open_id === undefined ? null : String(input.payload.open_id),
    external_id: typeof input.payload.external_id === "string" ? input.payload.external_id : null,
    name: typeof input.payload.name === "string" ? input.payload.name : token,
    status,
    source: "webhook",
    signers: Array.isArray(input.payload.signers) ? input.payload.signers : [],
    provider_payload: input.payload,
    last_event_type: input.eventType,
    last_event_at: agora,
  };
  if (input.eventType === "doc_signed") patch.signed_at = agora;
  if (input.eventType === "doc_refused") patch.refused_at = agora;
  if (input.eventType === "doc_expired") patch.expired_at = agora;

  const { error } = await db
    .from("zapsign_documents")
    .upsert(patch, { onConflict: "organization_id,external_token" });
  if (error) return { ok: false, erro: "zapsign_webhook_persist_failed", status: 500 };
  return { ok: true, data: { document_token: token } };
}

export async function buscarIntegracaoPorWebhookToken(
  db: SupabaseClient,
  pathToken: string,
): Promise<IntegrationRow | null> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select(
      "id, organization_id, oauth_access_token_encrypted, webhook_secret_encrypted, webhook_path_token, status, status_reason, store_metadata, last_health_check_at, updated_at",
    )
    .eq("provider", ZAPSIGN_PROVIDER)
    .eq("webhook_path_token", pathToken)
    .maybeSingle();
  if (error) throw new Error(`zapsign_webhook_lookup_failed: ${error.message}`);
  return (data ?? null) as IntegrationRow | null;
}

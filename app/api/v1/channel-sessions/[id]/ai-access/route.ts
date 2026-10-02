import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  aiAccessUpdateSchema,
  lerModoDeAcessoDaIa,
  lerNumerosDeTeste,
} from "@/lib/ai/elegibilidade/pre-go-live";
import { frasesDaCampanhaDoCanal } from "@/lib/ai/elegibilidade/campanha";
import {
  lerConfigDeVozWhatsapp,
  metadataComConfigDeVozWhatsapp,
  whatsappVoiceUpdateSchema,
} from "@/lib/voice/whatsapp-elevenlabs";
import { WHATSAPP_VOICE_PROVIDERS } from "@/lib/voice/whatsapp-voice-options";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** Só administradores podem ler os telefones de teste ou mudar o alcance da IA. */
export async function GET(_req: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("admin", {
    requestId,
    resource: "channel_sessions",
    allowPlatformAdmin: true,
  });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return fail("validation_failed", "Canal inválido.", 422, { requestId });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("channel_sessions")
    .select("metadata")
    .eq("organization_id", auth.org.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error)
    return fail("internal_error", "Não foi possível carregar o acesso da IA.", 500, { requestId });
  if (!data) return fail("not_found", "Canal não encontrado.", 404, { requestId });
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", auth.org.orgId)
    .maybeSingle();
  if (orgError)
    return fail("internal_error", "Não foi possível carregar as frases de campanha.", 500, {
      requestId,
    });
  const voiceCredentials = await listarCredenciaisDeVoz(admin, auth.org.orgId);
  return ok(
    {
      mode: lerModoDeAcessoDaIa(data.metadata),
      test_phone_numbers: lerNumerosDeTeste(data.metadata),
      campaign_phrases: frasesDaCampanhaDoCanal(org?.settings ?? null, id),
      voice: lerConfigDeVozWhatsapp(data.metadata),
      voice_credentials: voiceCredentials,
      elevenlabs_credentials: voiceCredentials.filter((cred) => cred.provider === "elevenlabs"),
    },
    { requestId },
  );
}

async function listarCredenciaisDeVoz(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
) {
  const { data } = await admin
    .from("ai_provider_credentials_safe")
    .select("id, provider, label, validated_at, is_active")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return (data ?? [])
    .filter(
      (c) =>
        c.is_active === true &&
        typeof c.validated_at === "string" &&
        WHATSAPP_VOICE_PROVIDERS.includes(c.provider as (typeof WHATSAPP_VOICE_PROVIDERS)[number]),
    )
    .map((c) => ({
      id: c.id as string,
      provider: c.provider as (typeof WHATSAPP_VOICE_PROVIDERS)[number],
      label: c.label as string,
      validated_at: (c.validated_at as string | null) ?? null,
      is_active: true,
    }));
}

export async function PATCH(req: NextRequest, { params }: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("admin", {
    requestId,
    resource: "channel_sessions",
    allowPlatformAdmin: true,
  });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return fail("validation_failed", "Canal inválido.", 422, { requestId });
  const raw = await req.json().catch(() => null);
  const parsed = aiAccessUpdateSchema.safeParse(raw);
  if (!parsed.success)
    return fail("validation_failed", "Use telefones com DDI, por exemplo +5511999998888.", 422, {
      requestId,
    });
  const vozPedida =
    raw && typeof raw === "object" && !Array.isArray(raw) && "voice" in raw
      ? whatsappVoiceUpdateSchema.safeParse((raw as { voice?: unknown }).voice)
      : null;
  if (vozPedida?.success === false) {
    return fail("validation_failed", "Confira a configuração de voz do WhatsApp.", 422, {
      requestId,
      details: vozPedida.error.flatten(),
    });
  }
  const { mode, test_phone_numbers, campaign_phrases } = parsed.data;
  const admin = createAdminClient();
  const { data: canal, error: canalError } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", auth.org.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (canalError)
    return fail("internal_error", "Não foi possível carregar o canal.", 500, { requestId });
  if (!canal) return fail("not_found", "Canal não encontrado.", 404, { requestId });

  if (vozPedida?.success && vozPedida.data.mode !== "off") {
    const { data: cred, error: credError } = await admin
      .from("ai_provider_credentials")
      .select("id, provider, is_active, validated_at")
      .eq("organization_id", auth.org.orgId)
      .eq("id", vozPedida.data.credential_id ?? "")
      .maybeSingle();
    if (credError)
      return fail("internal_error", "Não foi possível conferir a credencial de voz.", 500, {
        requestId,
      });
    if (
      !cred ||
      cred.provider !== vozPedida.data.provider ||
      cred.is_active !== true ||
      !cred.validated_at
    ) {
      return fail(
        "validation_failed",
        "Escolha uma credencial de voz ativa, validada e do provedor selecionado.",
        422,
        { requestId },
      );
    }
  }

  // RPC atômica: grava o modo do canal e as frases da organização juntas.
  const { data, error } = await admin.rpc(
    "fn_configurar_pre_go_live_canal" as never,
    {
      p_org: auth.org.orgId,
      p_canal: id,
      p_modo: mode,
      p_numeros: test_phone_numbers,
      p_frases_campanha: campaign_phrases,
    } as never,
  );
  if (error)
    return fail(
      "internal_error",
      "Não foi possível salvar o acesso da IA. Verifique se o banco está atualizado.",
      500,
      { requestId },
    );
  if (data !== 1) return fail("not_found", "Canal não encontrado.", 404, { requestId });

  if (vozPedida?.success) {
    const { data: atual, error: atualError } = await admin
      .from("channel_sessions")
      .select("metadata")
      .eq("organization_id", auth.org.orgId)
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (atualError || !atual) {
      return fail("internal_error", "Não foi possível reler o canal.", 500, { requestId });
    }
    const metadata = metadataComConfigDeVozWhatsapp(
      atual.metadata,
      vozPedida.data,
      new Date().toISOString(),
    );
    const { error: voiceError } = await admin
      .from("channel_sessions")
      .update({ metadata })
      .eq("organization_id", auth.org.orgId)
      .eq("id", id)
      .is("archived_at", null);
    if (voiceError) {
      return fail("internal_error", "Não foi possível salvar a voz do WhatsApp.", 500, {
        requestId,
      });
    }
  }
  void audit({
    action: "channel.ai_access_updated",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "channel_session",
    resourceId: id,
    requestId,
    metadata: {
      mode,
      test_phone_numbers_count: test_phone_numbers.length,
      campaign_phrases_count: campaign_phrases.length,
      ...(vozPedida?.success
        ? {
            voice_mode: vozPedida.data.mode,
            voice_provider: vozPedida.data.provider,
            voice_source: vozPedida.data.voice_source,
          }
        : {}),
    },
  });
  const voiceCredentials = await listarCredenciaisDeVoz(admin, auth.org.orgId);
  return ok(
    {
      ...parsed.data,
      voice: vozPedida?.success ? vozPedida.data : undefined,
      voice_credentials: voiceCredentials,
      elevenlabs_credentials: voiceCredentials.filter((cred) => cred.provider === "elevenlabs"),
    },
    { requestId },
  );
}

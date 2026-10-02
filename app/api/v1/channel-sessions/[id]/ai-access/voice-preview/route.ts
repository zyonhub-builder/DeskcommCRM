import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { loadCredential } from "@/lib/ai/credentials";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { sintetizarElevenLabs, sintetizarOpenAITts } from "@/lib/voice/whatsapp-elevenlabs";
import { OPENAI_TTS_VOICES, WHATSAPP_VOICE_PROVIDERS } from "@/lib/voice/whatsapp-voice-options";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const WHATSAPP_VOICE_PREVIEW_TEXT = "Olá, esta é uma prévia da voz do atendimento.";

const previewSchema = z
  .object({
    provider: z.enum(WHATSAPP_VOICE_PROVIDERS),
    credential_id: z.string().uuid(),
    voice_id: z.string().trim().min(1).max(160),
  })
  .superRefine((valor, ctx) => {
    if (
      valor.provider === "openai" &&
      !OPENAI_TTS_VOICES.includes(valor.voice_id as (typeof OPENAI_TTS_VOICES)[number])
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["voice_id"],
        message: "Escolha uma voz da OpenAI.",
      });
    }
    if (valor.provider === "elevenlabs" && valor.voice_id.length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["voice_id"],
        message: "Informe o voice_id da ElevenLabs.",
      });
    }
  });

export async function POST(req: NextRequest, { params }: Context): Promise<Response> {
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
  const parsed = previewSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Confira a configuração de voz do WhatsApp.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

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

  try {
    const cred = await loadCredential(parsed.data.credential_id, auth.org.orgId);
    if (cred.provider !== parsed.data.provider) {
      return fail(
        "validation_failed",
        "Escolha uma credencial de voz ativa, validada e do provedor selecionado.",
        422,
        { requestId },
      );
    }
    const audio =
      parsed.data.provider === "openai"
        ? await sintetizarOpenAITts({
            apiKey: cred.apiKey,
            voiceId: parsed.data.voice_id,
            text: WHATSAPP_VOICE_PREVIEW_TEXT,
          })
        : await sintetizarElevenLabs({
            apiKey: cred.apiKey,
            voiceId: parsed.data.voice_id,
            text: WHATSAPP_VOICE_PREVIEW_TEXT,
          });
    return new Response(new Uint8Array(audio.buffer), {
      status: 200,
      headers: {
        "Content-Type": audio.mime,
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch {
    return fail("voice_assistant_unavailable", "Não foi possível gerar a prévia da voz.", 503, {
      requestId,
    });
  }
}

import { z } from "zod";

import {
  OPENAI_TTS_DEFAULT_VOICE,
  OPENAI_TTS_VOICES,
  WHATSAPP_VOICE_PROVIDERS,
  type WhatsappVoiceProvider,
} from "@/lib/voice/whatsapp-voice-options";

export const WHATSAPP_VOICE_CONFIG_KEY = "whatsapp_voice";
export const WHATSAPP_VOICE_CONVERSATION_PREF_KEY = "whatsapp_voice_preference";

export const WHATSAPP_VOICE_MODES = [
  "off",
  "audio_only",
  "audio_or_request",
  "literacy_assist",
  "always",
] as const;

export type WhatsappVoiceMode = (typeof WHATSAPP_VOICE_MODES)[number];

export const WHATSAPP_VOICE_SOURCES = ["library", "cloned_authorized"] as const;
export type WhatsappVoiceSource = (typeof WHATSAPP_VOICE_SOURCES)[number];

export interface WhatsappVoiceConfig {
  mode: WhatsappVoiceMode;
  provider: WhatsappVoiceProvider;
  credential_id: string | null;
  voice_id: string;
  voice_label: string;
  voice_source: WhatsappVoiceSource;
  cloned_voice_consent: boolean;
  speaker_name: string;
  updated_at: string | null;
}

export const whatsappVoiceUpdateSchema = z
  .object({
    mode: z.enum(WHATSAPP_VOICE_MODES),
    provider: z.enum(WHATSAPP_VOICE_PROVIDERS).default("elevenlabs"),
    credential_id: z.string().uuid().nullable().default(null),
    voice_id: z.string().trim().max(160).default(""),
    voice_label: z.string().trim().max(120).default(""),
    voice_source: z.enum(WHATSAPP_VOICE_SOURCES).default("library"),
    cloned_voice_consent: z.boolean().default(false),
    speaker_name: z.string().trim().max(120).default(""),
  })
  .superRefine((valor, ctx) => {
    if (valor.mode !== "off") {
      if (!valor.credential_id) {
        ctx.addIssue({
          code: "custom",
          path: ["credential_id"],
          message: "Escolha uma credencial de voz.",
        });
      }
      if (valor.provider === "openai") {
        if (!OPENAI_TTS_VOICES.includes(valor.voice_id as (typeof OPENAI_TTS_VOICES)[number])) {
          ctx.addIssue({
            code: "custom",
            path: ["voice_id"],
            message: "Escolha uma voz da OpenAI.",
          });
        }
        if (valor.voice_source === "cloned_authorized") {
          ctx.addIssue({
            code: "custom",
            path: ["voice_source"],
            message: "Voz clonada usa ElevenLabs.",
          });
        }
      } else if (valor.voice_id.length < 3) {
        ctx.addIssue({
          code: "custom",
          path: ["voice_id"],
          message: "Informe o voice_id da ElevenLabs.",
        });
      }
    }
    if (
      valor.mode !== "off" &&
      valor.provider === "elevenlabs" &&
      valor.voice_source === "cloned_authorized"
    ) {
      if (!valor.cloned_voice_consent) {
        ctx.addIssue({
          code: "custom",
          path: ["cloned_voice_consent"],
          message: "Confirme a autorização da voz clonada.",
        });
      }
      if (valor.speaker_name.length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["speaker_name"],
          message: "Informe de quem é a voz autorizada.",
        });
      }
    }
  })
  .transform((valor): WhatsappVoiceConfig => ({
    mode: valor.mode,
    provider: valor.mode === "off" ? "elevenlabs" : valor.provider,
    credential_id: valor.mode === "off" ? null : valor.credential_id,
    voice_id:
      valor.mode === "off"
        ? ""
        : valor.provider === "openai" && valor.voice_id === ""
          ? OPENAI_TTS_DEFAULT_VOICE
          : valor.voice_id,
    voice_label: valor.voice_label,
    voice_source: valor.provider === "openai" ? "library" : valor.voice_source,
    cloned_voice_consent:
      valor.provider === "elevenlabs" &&
      valor.voice_source === "cloned_authorized" &&
      valor.cloned_voice_consent,
    speaker_name:
      valor.provider === "elevenlabs" && valor.voice_source === "cloned_authorized"
        ? valor.speaker_name
        : "",
    updated_at: null,
  }));

export type WhatsappVoiceUpdate = z.output<typeof whatsappVoiceUpdateSchema>;

export const WHATSAPP_VOICE_DEFAULT: WhatsappVoiceConfig = {
  mode: "off",
  provider: "elevenlabs",
  credential_id: null,
  voice_id: "",
  voice_label: "",
  voice_source: "library",
  cloned_voice_consent: false,
  speaker_name: "",
  updated_at: null,
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

export function lerConfigDeVozWhatsapp(metadata: unknown): WhatsappVoiceConfig {
  const raw = objeto(objeto(metadata)[WHATSAPP_VOICE_CONFIG_KEY]);
  const mode = WHATSAPP_VOICE_MODES.includes(raw.mode as WhatsappVoiceMode)
    ? (raw.mode as WhatsappVoiceMode)
    : "off";
  const voice_source = WHATSAPP_VOICE_SOURCES.includes(raw.voice_source as WhatsappVoiceSource)
    ? (raw.voice_source as WhatsappVoiceSource)
    : "library";
  const provider = WHATSAPP_VOICE_PROVIDERS.includes(raw.provider as WhatsappVoiceProvider)
    ? (raw.provider as WhatsappVoiceProvider)
    : "elevenlabs";
  return {
    mode,
    provider,
    credential_id: typeof raw.credential_id === "string" ? raw.credential_id : null,
    voice_id: texto(raw.voice_id),
    voice_label: texto(raw.voice_label),
    voice_source,
    cloned_voice_consent: raw.cloned_voice_consent === true,
    speaker_name: texto(raw.speaker_name),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

export function metadataComConfigDeVozWhatsapp(
  metadata: unknown,
  config: WhatsappVoiceConfig,
  updatedAt: string,
): Record<string, unknown> {
  return {
    ...objeto(metadata),
    [WHATSAPP_VOICE_CONFIG_KEY]: {
      mode: config.mode,
      provider: config.provider,
      credential_id: config.credential_id,
      voice_id: config.voice_id,
      voice_label: config.voice_label,
      voice_source: config.voice_source,
      cloned_voice_consent: config.cloned_voice_consent,
      speaker_name: config.speaker_name,
      updated_at: updatedAt,
    },
  };
}

export function conversaPrefereAudioWhatsapp(metadata: unknown): boolean {
  const pref = objeto(objeto(metadata)[WHATSAPP_VOICE_CONVERSATION_PREF_KEY]);
  return pref.audio === true && pref.reason === "dificuldade_leitura";
}

function normalizar(textoCru: string): string {
  return textoCru
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function clienteIndicouDificuldadeDeLeitura(textoCru: string | null | undefined): boolean {
  const t = normalizar(textoCru ?? "");
  if (!t.trim()) return false;
  return [
    /\bnao\s+(sei|consigo|posso)\s+(ler|le)\b/,
    /\bnao\s+(leio|sou alfabetizado)\b/,
    /\bsou\s+analfabeto\b/,
    /\b(tenho|to com|estou com)\s+dificuldade\s+(para|pra|de)?\s*(ler|le)\b/,
  ].some((regex) => regex.test(t));
}

export function clientePediuTexto(textoCru: string | null | undefined): boolean {
  const t = normalizar(textoCru ?? "");
  if (!t.trim()) return false;
  if (/\bnao\s+quero\s+(texto|escrito|por escrito)\b/.test(t)) return false;
  return [
    /\b(pode|podia|poderia)\s+(escrever|digitar)\b/,
    /\b(manda|mande|envia|envie|responde|responda)\s+(por\s+)?(texto|escrito|por escrito)\b/,
    /\b(prefiro|quero)\s+(receber\s+)?(por\s+)?(texto|escrito|por escrito)\b/,
    /\b(sem|nao\s+(manda|mande|envia|envie|quero))\b.{0,30}\b(audio|voz)\b/,
    /\b(para|pare)\s+de\b.{0,30}\b(audio|voz)\b/,
  ].some((regex) => regex.test(t));
}

export function clientePediuAudio(textoCru: string | null | undefined): boolean {
  const t = normalizar(textoCru ?? "");
  if (!t.trim()) return false;
  if (clienteIndicouDificuldadeDeLeitura(textoCru)) return true;
  return [
    /\b(me\s+)?(manda|mande|envia|envie|responde|responda|fala|fale)\b.{0,40}\b(audio|voz)\b/,
    /\b(audio|voz)\b.{0,40}\b(por favor|pra mim|para mim|melhor)\b/,
  ].some((regex) => regex.test(t));
}

export function deveResponderWhatsappPorAudio(
  config: WhatsappVoiceConfig,
  input: {
    inboundType: string | null;
    inboundText: string | null;
    hasInbound: boolean;
    conversationPrefersAudio?: boolean;
  },
): {
  sim: boolean;
  motivo:
    | "off"
    | "sem_config"
    | "sem_inbound"
    | "audio_inbound"
    | "pedido_texto"
    | "dificuldade_leitura"
    | "preferencia_conversa"
    | "always"
    | "texto";
} {
  if (config.mode === "off") return { sim: false, motivo: "off" };
  if (!config.credential_id || !config.voice_id) return { sim: false, motivo: "sem_config" };
  if (!input.hasInbound) return { sim: false, motivo: "sem_inbound" };
  if (config.mode === "always") return { sim: true, motivo: "always" };
  if (config.mode === "literacy_assist") {
    if (clientePediuTexto(input.inboundText)) return { sim: false, motivo: "texto" };
    if (clienteIndicouDificuldadeDeLeitura(input.inboundText)) {
      return { sim: true, motivo: "dificuldade_leitura" };
    }
    if (input.conversationPrefersAudio === true) {
      return { sim: true, motivo: "preferencia_conversa" };
    }
    return { sim: false, motivo: "texto" };
  }
  if (input.inboundType === "audio") return { sim: true, motivo: "audio_inbound" };
  if (config.mode === "audio_or_request" && clientePediuAudio(input.inboundText)) {
    return { sim: true, motivo: "pedido_texto" };
  }
  return { sim: false, motivo: "texto" };
}

export async function sintetizarElevenLabs(input: {
  apiKey: string;
  voiceId: string;
  text: string;
}): Promise<{ buffer: Buffer; mime: "audio/mpeg" }> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": input.apiKey,
      },
      body: JSON.stringify({
        text: input.text,
        model_id: "eleven_multilingual_v2",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`elevenlabs_tts_${res.status}`);
  }
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
}

export async function sintetizarOpenAITts(input: {
  apiKey: string;
  voiceId: string;
  text: string;
}): Promise<{ buffer: Buffer; mime: "audio/mpeg" }> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      input: input.text,
      voice: input.voiceId,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    throw new Error(`openai_tts_${res.status}`);
  }
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
}

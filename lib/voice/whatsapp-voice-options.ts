export const WHATSAPP_VOICE_PROVIDERS = ["elevenlabs", "openai"] as const;
export type WhatsappVoiceProvider = (typeof WHATSAPP_VOICE_PROVIDERS)[number];

export const OPENAI_TTS_VOICES = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
] as const;

export type OpenAITtsVoice = (typeof OPENAI_TTS_VOICES)[number];

export const OPENAI_TTS_DEFAULT_VOICE: OpenAITtsVoice = "marin";

export const OPENAI_TTS_VOICE_LABELS: Record<OpenAITtsVoice, string> = {
  alloy: "Alloy",
  ash: "Ash",
  ballad: "Ballad",
  coral: "Coral",
  echo: "Echo",
  fable: "Fable",
  marin: "Marin",
  nova: "Nova",
  onyx: "Onyx",
  sage: "Sage",
  shimmer: "Shimmer",
  verse: "Verse",
  cedar: "Cedar",
};

export const OPENAI_TTS_VOICE_TONE_LABELS: Record<OpenAITtsVoice, string> = {
  alloy: "neutra",
  ash: "alternativa",
  ballad: "expressiva",
  coral: "clara",
  echo: "alternativa",
  fable: "narrativa",
  marin: "recomendado",
  nova: "leve",
  onyx: "firme",
  sage: "calma",
  shimmer: "leve",
  verse: "expressiva",
  cedar: "recomendado",
};

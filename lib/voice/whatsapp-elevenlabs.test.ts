import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clienteIndicouDificuldadeDeLeitura,
  clientePediuAudio,
  clientePediuTexto,
  conversaPrefereAudioWhatsapp,
  deveResponderWhatsappPorAudio,
  lerConfigDeVozWhatsapp,
  metadataComConfigDeVozWhatsapp,
  sintetizarOpenAITts,
  type WhatsappVoiceConfig,
  whatsappVoiceUpdateSchema,
} from "./whatsapp-elevenlabs";

const config: WhatsappVoiceConfig = {
  mode: "audio_or_request",
  provider: "elevenlabs",
  credential_id: "11111111-1111-4111-8111-111111111111",
  voice_id: "voz_123",
  voice_label: "Dr. Ana",
  voice_source: "cloned_authorized",
  cloned_voice_consent: true,
  speaker_name: "Dra. Ana",
  updated_at: null,
};

describe("voz do WhatsApp com ElevenLabs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserva outras chaves de metadata ao salvar a configuração", () => {
    const metadata = metadataComConfigDeVozWhatsapp(
      { ai_gate: "allowlist", segredo_do_transporte: "fica" },
      config,
      "2026-10-01T12:00:00.000Z",
    );
    expect(metadata.ai_gate).toBe("allowlist");
    expect(metadata.segredo_do_transporte).toBe("fica");
    expect(lerConfigDeVozWhatsapp(metadata)).toMatchObject({
      mode: "audio_or_request",
      provider: "elevenlabs",
      credential_id: config.credential_id,
      voice_id: "voz_123",
      updated_at: "2026-10-01T12:00:00.000Z",
    });
  });

  it("detecta pedido textual de áudio sem exigir acento", () => {
    expect(clientePediuAudio("Não sei ler, me manda áudio por favor")).toBe(true);
    expect(clientePediuAudio("Pode responder normal por aqui")).toBe(false);
  });

  it("mantém áudio quando o cliente indica dificuldade de leitura", () => {
    const cfg = { ...config, mode: "literacy_assist" as const };

    expect(clienteIndicouDificuldadeDeLeitura("Não consigo ler, manda áudio")).toBe(true);
    expect(
      deveResponderWhatsappPorAudio(cfg, {
        hasInbound: true,
        inboundType: "text",
        inboundText: "Não consigo ler, manda áudio",
      }),
    ).toEqual({ sim: true, motivo: "dificuldade_leitura" });
    expect(
      deveResponderWhatsappPorAudio(cfg, {
        hasInbound: true,
        inboundType: "text",
        inboundText: "ok, obrigado",
        conversationPrefersAudio: true,
      }),
    ).toEqual({ sim: true, motivo: "preferencia_conversa" });
  });

  it("não mantém áudio quando o cliente pede texto", () => {
    const cfg = { ...config, mode: "literacy_assist" as const };

    expect(clientePediuTexto("Pode escrever por texto agora")).toBe(true);
    expect(clientePediuTexto("Não quero texto, manda áudio")).toBe(false);
    expect(
      deveResponderWhatsappPorAudio(cfg, {
        hasInbound: true,
        inboundType: "text",
        inboundText: "Pode escrever por texto agora",
        conversationPrefersAudio: true,
      }),
    ).toEqual({ sim: false, motivo: "texto" });
  });

  it("lê a preferência de áudio da conversa pelo metadata", () => {
    expect(
      conversaPrefereAudioWhatsapp({
        whatsapp_voice_preference: {
          audio: true,
          reason: "dificuldade_leitura",
        },
      }),
    ).toBe(true);
    expect(conversaPrefereAudioWhatsapp({ whatsapp_voice_preference: { audio: true } })).toBe(
      false,
    );
  });

  it("responde em áudio quando o cliente mandou áudio", () => {
    expect(
      deveResponderWhatsappPorAudio(config, {
        hasInbound: true,
        inboundType: "audio",
        inboundText: "[Mídia do cliente: um áudio]",
      }),
    ).toEqual({ sim: true, motivo: "audio_inbound" });
  });

  it("falha fechado quando falta credencial ou quando não há inbound", () => {
    expect(
      deveResponderWhatsappPorAudio(
        { ...config, credential_id: null },
        {
          hasInbound: true,
          inboundType: "audio",
          inboundText: null,
        },
      ),
    ).toEqual({ sim: false, motivo: "sem_config" });
    expect(
      deveResponderWhatsappPorAudio(
        { ...config, mode: "always" },
        {
          hasInbound: false,
          inboundType: null,
          inboundText: null,
        },
      ),
    ).toEqual({ sim: false, motivo: "sem_inbound" });
  });

  it("aceita OpenAI com voz pronta sem exigir Voice ID manual", () => {
    const parsed = whatsappVoiceUpdateSchema.parse({
      mode: "always",
      provider: "openai",
      credential_id: "11111111-1111-4111-8111-111111111111",
      voice_id: "marin",
      voice_label: "",
      voice_source: "library",
    });

    expect(parsed).toMatchObject({
      mode: "always",
      provider: "openai",
      voice_id: "marin",
      voice_source: "library",
      cloned_voice_consent: false,
      speaker_name: "",
    });
  });

  it("chama o endpoint de fala da OpenAI sem expor a chave no corpo", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchMock);

    const audio = await sintetizarOpenAITts({
      apiKey: "sk-teste",
      voiceId: "marin",
      text: "Olá",
    });

    expect(audio.mime).toBe("audio/mpeg");
    expect([...audio.buffer]).toEqual([1, 2, 3]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(init.headers).toMatchObject({ authorization: "Bearer sk-teste" });
    expect(String(init.body)).toContain('"voice":"marin"');
    expect(String(init.body)).not.toContain("sk-teste");
  });
});

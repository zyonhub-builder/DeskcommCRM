import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChannelAiAccess } from "./ChannelAiAccess";

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const voice = {
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

function renderComQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChannelAiAccess channelId="canal-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  api.get.mockResolvedValue({
    data: {
      mode: "open",
      test_phone_numbers: ["+5569992800140"],
      campaign_phrases: ["abc"],
      voice,
      elevenlabs_credentials: [],
    },
  });
  api.patch.mockResolvedValue({
    data: {
      mode: "open",
      test_phone_numbers: ["+5569992800140"],
      campaign_phrases: ["abc"],
      voice,
      elevenlabs_credentials: [],
    },
  });
});

describe("ChannelAiAccess", () => {
  it("salva edições sem sair do modo público", async () => {
    const user = userEvent.setup();
    renderComQuery();

    await user.click(screen.getByRole("button", { name: "Configurar acesso da IA" }));
    await user.click(await screen.findByRole("button", { name: "Salvar edições" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/v1/channel-sessions/canal-1/ai-access", {
        mode: "open",
        test_phone_numbers: ["+5569992800140"],
        campaign_phrases: ["abc"],
        voice: {
          mode: "off",
          provider: "elevenlabs",
          credential_id: null,
          voice_id: "",
          voice_label: "",
          voice_source: "library",
          cloned_voice_consent: false,
          speaker_name: "",
        },
      }),
    );
  });

  it("mostra direcionamento nas vozes prontas da OpenAI", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({
      data: {
        mode: "open",
        test_phone_numbers: ["+5569992800140"],
        campaign_phrases: ["abc"],
        voice: {
          ...voice,
          mode: "audio_or_request",
          provider: "openai",
          credential_id: "cred-openai",
          voice_id: "marin",
          voice_label: "Marin",
          voice_source: "library",
        },
        voice_credentials: [
          {
            id: "cred-openai",
            provider: "openai",
            label: "OpenAI da Talismã",
            validated_at: "2026-10-01T12:00:00.000Z",
            is_active: true,
          },
        ],
        elevenlabs_credentials: [],
      },
    });

    renderComQuery();

    await user.click(screen.getByRole("button", { name: "Configurar acesso da IA" }));

    expect(await screen.findByText("Marin · recomendado")).toBeInTheDocument();
  });

  it("oferece o modo que mantém áudio por dificuldade de leitura", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({
      data: {
        mode: "open",
        test_phone_numbers: ["+5569992800140"],
        campaign_phrases: ["abc"],
        voice: {
          ...voice,
          mode: "literacy_assist",
          credential_id: "cred-openai",
          provider: "openai",
          voice_id: "marin",
        },
        voice_credentials: [
          {
            id: "cred-openai",
            provider: "openai",
            label: "OpenAI da Talismã",
            validated_at: "2026-10-01T12:00:00.000Z",
            is_active: true,
          },
        ],
        elevenlabs_credentials: [],
      },
    });
    renderComQuery();

    await user.click(screen.getByRole("button", { name: "Configurar acesso da IA" }));

    expect(
      await screen.findByText("Quando o cliente disser que não sabe ler, manter em áudio"),
    ).toBeInTheDocument();
  });
});

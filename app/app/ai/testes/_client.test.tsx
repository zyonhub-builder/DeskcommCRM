import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const api = vi.hoisted(() => ({ post: vi.fn() }));
const push = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PortalDeTesteDeAgentes, type AgenteDeTeste } from "./_client";

const AGENT = "33333333-3333-4333-8333-333333333333";
const VERSION = "44444444-4444-4444-8444-444444444444";

const agente: AgenteDeTeste = {
  id: AGENT,
  name: "Atendente Previdenciário - Talismã",
  description: "Triagem inicial para benefícios previdenciários.",
  is_active: true,
  published_version: { id: VERSION, version_number: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  let seq = 0;
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
    () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function abrir() {
  return render(
    <PortalDeTesteDeAgentes
      agentes={[agente]}
      selectedAgentId={AGENT}
      titulo="Testar agentes"
      subtitulo="Converse com uma versão publicada sem abrir a configuração."
    />,
  );
}

describe("PortalDeTesteDeAgentes", () => {
  it("envia o histórico acumulado nas próximas mensagens do teste", async () => {
    api.post
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          final_text: "Esse acidente aconteceu quando?",
          latency_ms: 1234,
        },
      })
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          final_text: "Entendi. Você chegou a ficar afastado?",
          latency_ms: 987,
        },
      });
    const user = userEvent.setup({ delay: null });
    abrir();

    await user.type(
      screen.getByLabelText("Mensagem"),
      "tive um acidente e preciso de ajuda pra conseguir o beneficio",
    );
    await user.click(screen.getByRole("button", { name: "Enviar teste" }));
    expect(await screen.findByText("Esse acidente aconteceu quando?")).toBeVisible();
    expect(await screen.findByText("Respondido em 1,2s")).toBeVisible();

    await user.type(screen.getByLabelText("Mensagem"), "ontem");
    await user.click(screen.getByRole("button", { name: "Enviar teste" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    const [, segundoBody] = api.post.mock.calls[1]!;
    expect(segundoBody).toMatchObject({
      sample_message: "ontem",
      skip_checkpoint: true,
      sample_messages: [
        {
          direction: "inbound",
          body: "tive um acidente e preciso de ajuda pra conseguir o beneficio",
        },
        {
          direction: "outbound",
          body: "Esse acidente aconteceu quando?",
        },
        {
          direction: "inbound",
          body: "ontem",
        },
      ],
    });
    expect(await screen.findByText("Entendi. Você chegou a ficar afastado?")).toBeVisible();
    expect(await screen.findByText("Respondido em 987ms")).toBeVisible();
  });

  it("mantém a conversa dentro de uma área com rolagem própria", () => {
    abrir();

    expect(screen.getByTestId("agent-test-panel")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("agent-test-thread")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
    );
  });
});

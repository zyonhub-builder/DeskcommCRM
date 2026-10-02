import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAgentVersionConfig: vi.fn(),
  runAgentPreview: vi.fn(),
}));

vi.mock("./agent-config", () => ({
  loadAgentVersionConfig: mocks.loadAgentVersionConfig,
}));

vi.mock("./inbound-turn", () => ({
  runAgentPreview: mocks.runAgentPreview,
}));

import { testAgentVersion } from "./sandbox";

describe("testAgentVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAgentVersionConfig.mockResolvedValue({ agentId: "agent-1" });
    mocks.runAgentPreview.mockResolvedValue(undefined);
  });

  it("monta o cenário com o histórico completo quando ele é enviado", async () => {
    const sampleMessages = [
      {
        direction: "inbound" as const,
        body: "tive um acidente",
        sent_at: "2026-09-28T18:00:00.000Z",
      },
      {
        direction: "outbound" as const,
        body: "Esse acidente aconteceu quando?",
        sent_at: "2026-09-28T18:00:05.000Z",
      },
      {
        direction: "inbound" as const,
        body: "ontem",
        sent_at: "2026-09-28T18:00:10.000Z",
      },
    ];

    await testAgentVersion({} as never, {} as never, {
      organizationId: "org-1",
      agentId: "agent-1",
      versionId: "version-1",
      runId: "run-1",
      sampleMessage: "ontem",
      sampleMessages,
      channelId: null,
      skipCheckpoint: true,
    });

    expect(mocks.runAgentPreview).toHaveBeenCalledWith(
      {},
      {},
      expect.objectContaining({
        skipCheckpoint: true,
        context: expect.objectContaining({
          context: expect.objectContaining({ messages: sampleMessages }),
        }),
      }),
    );
  });
});

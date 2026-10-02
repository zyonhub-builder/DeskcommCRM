import type pg from "pg";
import { loadAgentVersionConfig } from "./agent-config";
import { runAgentPreview, type InboundTurnDeps } from "./inbound-turn";
import { newPreviewResult, scenarioContext, type TurnPreview } from "./preview";
import type { LeadContext } from "../edge/crm/get-lead-context";

type SampleMessage = Pick<LeadContext["messages"][number], "direction" | "body" | "sent_at">;

export async function testAgentVersion(
  pool: pg.Pool,
  deps: InboundTurnDeps,
  input: {
    organizationId: string;
    agentId: string;
    versionId: string;
    runId: string;
    sampleMessage: string;
    sampleMessages?: SampleMessage[];
    sampleContact?: { name?: string; phone?: string };
    channelId: string | null;
    skipCheckpoint?: boolean;
  },
) {
  const agent = await loadAgentVersionConfig(
    pool,
    input.organizationId,
    input.agentId,
    input.versionId,
  );
  if (!agent) throw new Error("preview_version_unavailable");
  const result = newPreviewResult();
  const messages =
    input.sampleMessages && input.sampleMessages.length > 0
      ? input.sampleMessages
      : [
          {
            direction: "inbound" as const,
            body: input.sampleMessage,
            sent_at: (deps.clock?.() ?? new Date()).toISOString(),
          },
        ];
  const context = scenarioContext(messages, input.sampleContact);
  const preview: TurnPreview & { skipCheckpoint?: boolean } = {
    kind: "sandbox",
    organizationId: input.organizationId,
    runId: input.runId,
    agent,
    context,
    contactId: null,
    channelId: input.channelId,
    skipCheckpoint: input.skipCheckpoint === true,
    result,
  };
  await runAgentPreview(deps, pool, preview);
  return result;
}

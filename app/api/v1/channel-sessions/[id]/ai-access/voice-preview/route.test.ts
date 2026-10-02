import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { loadCredential } from "@/lib/ai/credentials";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { sintetizarOpenAITts } from "@/lib/voice/whatsapp-elevenlabs";
import { POST } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/ai/credentials", () => ({ loadCredential: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/voice/whatsapp-elevenlabs", () => ({
  sintetizarElevenLabs: vi.fn(),
  sintetizarOpenAITts: vi.fn(),
}));

const org = "11111111-1111-4111-8111-111111111111";
const canal = "22222222-2222-4222-8222-222222222222";
const credencial = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ id: canal }) };

function req(body: unknown) {
  return new NextRequest(
    `http://localhost/api/v1/channel-sessions/${canal}/ai-access/voice-preview`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: org },
    org: { orgId: org, role: "admin" },
  } as Awaited<ReturnType<typeof requireRole>>);
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: async () => ({ data: { id: canal }, error: null }),
  };
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => query,
  } as unknown as ReturnType<typeof createAdminClient>);
  vi.mocked(loadCredential).mockResolvedValue({
    apiKey: "sk-teste",
    provider: "openai",
    label: "OpenAI",
    baseUrl: null,
  });
  vi.mocked(sintetizarOpenAITts).mockResolvedValue({
    buffer: Buffer.from([1, 2, 3]),
    mime: "audio/mpeg",
  });
});

describe("prévia de voz do WhatsApp", () => {
  it("gera áudio com credencial OpenAI da própria organização", async () => {
    const response = await POST(
      req({ provider: "openai", credential_id: credencial, voice_id: "marin" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(loadCredential).toHaveBeenCalledWith(credencial, org);
    expect(sintetizarOpenAITts).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-teste", voiceId: "marin" }),
    );
  });

  it("recusa credencial de provedor diferente da voz escolhida", async () => {
    vi.mocked(loadCredential).mockResolvedValueOnce({
      apiKey: "sk-teste",
      provider: "elevenlabs",
      label: "ElevenLabs",
      baseUrl: null,
    });

    const response = await POST(
      req({ provider: "openai", credential_id: credencial, voice_id: "marin" }),
      context,
    );

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("validation_failed");
    expect(sintetizarOpenAITts).not.toHaveBeenCalled();
  });
});

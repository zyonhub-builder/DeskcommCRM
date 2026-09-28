import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as InstanceAlerts from "@/lib/platform/instance-alerts";

import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { PROVIDERS_DE_MENSAGEM } from "@/lib/channels/capabilities";
import { enviarAlertaDeInstancia } from "@/lib/platform/instance-alerts";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/platform/instance-alerts", async (importActual) => {
  const actual = await importActual<typeof InstanceAlerts>();
  return {
    ...actual,
    enviarAlertaDeInstancia: vi.fn(),
  };
});

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CANAL_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_COM_MENSAGEM = PROVIDERS_DE_MENSAGEM[0] as (typeof PROVIDERS_DE_MENSAGEM)[number];

function thenable(value: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "is", "in", "order", "limit", "lt", "not"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => value;
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve);
  return builder;
}

function adminParaPatch() {
  const settings = {
    id: 1,
    enabled: true,
    channel_organization_id: ORG_ID,
    channel_session_id: CANAL_ID,
    recipient_kind: "phone",
    recipient: "+5511999999999",
    recipient_label: "Monitoramento",
    notify_on_down: true,
    notify_on_recovered: true,
    updated_at: "2026-09-28T18:00:00.000Z",
    updated_by: ADMIN_ID,
  };

  return {
    from: (table: string) => {
      if (table === "platform_instance_alert_settings") {
        return {
          select: () => thenable({ data: settings, error: null }),
          upsert: async () => ({ data: null, error: null }),
        };
      }
      if (table === "channel_sessions") {
        return {
          select: (projection: string) =>
            projection.startsWith("id, provider")
              ? thenable({
                  data: { id: CANAL_ID, provider: PROVIDER_COM_MENSAGEM, archived_at: null },
                  error: null,
                })
              : thenable({
                  data: [
                    {
                      id: CANAL_ID,
                      organization_id: ORG_ID,
                      display_name: "Canal",
                      phone_number: "+5511999999999",
                      provider: PROVIDER_COM_MENSAGEM,
                      status: "WORKING",
                      status_reason: null,
                      last_health_check_at: null,
                      last_status_change_at: null,
                      updated_at: "2026-09-28T18:00:00.000Z",
                      archived_at: null,
                      organizations: { display_name: "Org", legal_name: "Org Ltda" },
                    },
                  ],
                  error: null,
                }),
        };
      }
      if (table === "conversations") return { select: () => thenable({ data: [], error: null }) };
      if (table === "platform_instance_alert_deliveries") {
        return { select: () => thenable({ data: [], error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: ADMIN_ID },
    platformAdmin: { user_id: ADMIN_ID, scope: "full", mfa_required: false },
  } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    count: 1,
    limit: 3,
    remaining: 2,
    reset: Date.now() + 3600_000,
  } as never);
});

describe("Admin Instâncias — auditoria de aviso", () => {
  it("salva configuração sem mandar o singleton num resource_id UUID", async () => {
    vi.mocked(createAdminClient).mockReturnValue(adminParaPatch() as never);
    const { PATCH } = await import("./route");

    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/admin/instances", {
        method: "PATCH",
        body: JSON.stringify({
          enabled: true,
          channel_organization_id: ORG_ID,
          channel_session_id: CANAL_ID,
          recipient_kind: "phone",
          recipient: "+5511999999999",
          recipient_label: "Monitoramento",
          notify_on_down: true,
          notify_on_recovered: true,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform.instance_alert_settings_updated",
        resourceType: "platform_instance_alert_settings",
        metadata: expect.objectContaining({ settings_id: 1 }),
      }),
    );
    expect(vi.mocked(audit).mock.calls[0]?.[0]).not.toHaveProperty("resourceId");
  });

  it("envia teste sem mandar o singleton num resource_id UUID", async () => {
    vi.mocked(createAdminClient).mockReturnValue({} as never);
    vi.mocked(enviarAlertaDeInstancia).mockResolvedValue({
      status: "sent",
      reason: null,
      externalId: "msg-1",
      recipientMask: "....9999",
    });
    const { POST } = await import("./test-alert/route");

    const res = await POST(new NextRequest("http://localhost/api/v1/admin/instances/test-alert"));

    expect(res.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform.instance_alert_test_sent",
        resourceType: "platform_instance_alert_settings",
        metadata: expect.objectContaining({ settings_id: 1, status: "sent" }),
      }),
    );
    expect(vi.mocked(audit).mock.calls[0]?.[0]).not.toHaveProperty("resourceId");
  });
});

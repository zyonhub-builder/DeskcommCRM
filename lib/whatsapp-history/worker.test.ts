import { describe, expect, it, vi } from "vitest";

import type { HistoryTransport } from "@/lib/channels/history-transport";

import { syncWhatsappHistoryConnection } from "./worker";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const IMPORT_ID = "bbbbbbbb-1111-4000-8000-000000000002";

class SelectChain {
  constructor(private readonly row: unknown) {}

  eq(_key: string, _value: unknown): this {
    return this;
  }

  async maybeSingle(): Promise<{ data: unknown; error: null }> {
    return { data: this.row, error: null };
  }
}

class UpdateChain {
  eq(_key: string, _value: unknown): this {
    return this;
  }

  then<TResult1 = { error: null }, TResult2 = never>(
    onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
  }
}

function fakeAdmin(row: unknown) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  return {
    updates,
    admin: {
      from(table: string) {
        return {
          select: () => new SelectChain(row),
          update: (payload: Record<string, unknown>) => {
            updates.push({ table, payload });
            return new UpdateChain();
          },
        };
      },
    },
  };
}

function row(status = "qr_pending") {
  return {
    id: IMPORT_ID,
    organization_id: ORG,
    status,
    transport_session_name: "hist_aaaaaaaa_bbbbbbbb111140008000000000000002",
  };
}

function transport(status: string | null): HistoryTransport {
  return {
    startSession: vi.fn(),
    getSession: vi.fn(async () => (status ? { status } : null)),
    listChatsOverview: vi.fn(),
    listChatMessages: vi.fn(),
    deleteSession: vi.fn(),
  };
}

describe("syncWhatsappHistoryConnection", () => {
  it("mantém pendente quando o QR ainda não foi lido", async () => {
    const db = fakeAdmin(row());
    const auditFn = vi.fn();

    const result = await syncWhatsappHistoryConnection(
      { organizationId: ORG, importId: IMPORT_ID, actorUserId: "user-1" },
      {
        admin: db.admin as never,
        transport: transport("SCAN_QR_CODE"),
        auditFn: auditFn as never,
      },
    );

    expect(result).toMatchObject({
      found: true,
      changed: false,
      status: "qr_pending",
      transport_status: "SCAN_QR_CODE",
    });
    expect(db.updates).toEqual([]);
    expect(auditFn).not.toHaveBeenCalled();
  });

  it("promove a importação quando a sessão temporária fica conectada", async () => {
    const db = fakeAdmin(row());
    const auditFn = vi.fn();

    const result = await syncWhatsappHistoryConnection(
      {
        organizationId: ORG,
        importId: IMPORT_ID,
        actorUserId: "user-1",
        requestId: "req-1",
      },
      {
        admin: db.admin as never,
        transport: transport("WORKING"),
        now: () => new Date("2026-09-26T12:00:00.000Z"),
        auditFn: auditFn as never,
      },
    );

    expect(result).toMatchObject({
      found: true,
      changed: true,
      status: "importing",
      transport_status: "WORKING",
    });
    expect(db.updates).toEqual([
      {
        table: "whatsapp_history_imports",
        payload: {
          status: "importing",
          connected_at: "2026-09-26T12:00:00.000Z",
          lease_until: null,
          last_error_code: null,
          last_error_message: null,
        },
      },
    ]);
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "whatsapp_history.import_connected",
        actorUserId: "user-1",
        organizationId: ORG,
        resourceId: IMPORT_ID,
        requestId: "req-1",
      }),
    );
  });
});

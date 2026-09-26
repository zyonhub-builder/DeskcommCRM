import {
  getWahaClient,
  wahaFriendlyError,
  type WahaHistoryMessagesParams,
  type WahaHistorySessionOptions,
} from "@/lib/waha/client";

export interface HistoryTransportSession {
  status: string;
}

export interface HistoryTransport {
  startSession(name: string, options?: WahaHistorySessionOptions): Promise<HistoryTransportSession>;
  getSession(name: string): Promise<HistoryTransportSession | null>;
  listChatsOverview(session: string): Promise<unknown>;
  listChatMessages(
    session: string,
    chatId: string,
    params: WahaHistoryMessagesParams,
  ): Promise<unknown>;
  deleteSession(name: string): Promise<void>;
}

export function historicoDeCanalConfigurado(): boolean {
  const key = process.env.WAHA_API_KEY;
  return Boolean(process.env.WAHA_API_BASE_URL && key && key !== "dev_plaintext_change_me");
}

export function getHistoryTransport(): HistoryTransport | null {
  const client = getWahaClient();
  if (!client) return null;
  return {
    startSession: (name, options) => client.startHistorySession(name, options),
    getSession: (name) => client.getVerifiedSession(name),
    listChatsOverview: (session) => client.getChatsOverview(session),
    listChatMessages: (session, chatId, params) => client.getChatMessages(session, chatId, params),
    deleteSession: async (name) => {
      try {
        await client.logoutSession(name);
      } catch {
        // Melhor esforço: delete cobre sessão parada/ausente.
      }
      await client.deleteSession(name);
    },
  };
}

export function historyTransportFriendlyError(error: unknown): string {
  return wahaFriendlyError(error);
}

export async function fetchHistoryTransportQr(
  sessionName: string,
): Promise<{ status: "not_configured" } | { status: "ok"; response: Response }> {
  const baseUrl = process.env.WAHA_API_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;
  if (!baseUrl || !apiKey || apiKey === "dev_plaintext_change_me") {
    return { status: "not_configured" };
  }
  const response = await fetch(
    `${baseUrl}/api/${encodeURIComponent(sessionName)}/auth/qr?format=image`,
    { headers: { "X-Api-Key": apiKey }, cache: "no-store" },
  );
  return { status: "ok", response };
}

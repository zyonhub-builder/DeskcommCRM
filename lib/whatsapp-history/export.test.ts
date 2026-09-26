import { describe, expect, it } from "vitest";

import {
  csvLine,
  WHATSAPP_HISTORY_CHATS_EXPORT_HEADER,
  WHATSAPP_HISTORY_MESSAGES_EXPORT_HEADER,
  whatsappHistoryExportFilename,
} from "./export";

describe("exportação CSV do histórico do WhatsApp", () => {
  it("escapa vírgula, aspas e quebra de linha", () => {
    expect(csvLine(["ok", 'a,"b"\nc'])).toBe('ok,"a,""b""\nc"\n');
  });

  it("não declara colunas de conteúdo cru ou cifrado", () => {
    const headers = [
      ...WHATSAPP_HISTORY_MESSAGES_EXPORT_HEADER,
      ...WHATSAPP_HISTORY_CHATS_EXPORT_HEADER,
    ].join(",");

    expect(headers).toContain("body_length");
    expect(headers).not.toContain("body_encrypted");
    expect(headers).not.toContain("body_hash");
    expect(headers).not.toContain("chat_id_encrypted");
  });

  it("nomeia o arquivo com importação, dataset e data", () => {
    expect(
      whatsappHistoryExportFilename({
        importId: "aaaaaaaa-0000-4000-8000-000000000001",
        dataset: "messages",
        generatedAt: new Date("2026-09-26T12:00:00Z"),
      }),
    ).toBe("whatsapp-history-aaaaaaaa-messages-2026-09-26.csv");
  });
});

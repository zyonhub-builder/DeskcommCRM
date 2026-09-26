import { describe, expect, it } from "vitest";

import {
  csvLine,
  WHATSAPP_HISTORY_CHATS_EXPORT_HEADER,
  WHATSAPP_HISTORY_COMPLETE_MESSAGES_EXPORT_HEADER,
  WHATSAPP_HISTORY_EXPORT_FORMATS,
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

  it("declara uma coluna legível no export completo sem expor a cifra", () => {
    const headers = [...WHATSAPP_HISTORY_COMPLETE_MESSAGES_EXPORT_HEADER];

    expect(headers.slice(0, 5)).toEqual([
      "sent_at",
      "chat_label",
      "direction",
      "message_type",
      "body",
    ]);
    expect(headers).toContain("body_length");
    expect(headers).not.toContain("body_encrypted");
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
    expect(
      whatsappHistoryExportFilename({
        importId: "aaaaaaaa-0000-4000-8000-000000000001",
        dataset: "chats",
        format: "xlsx",
        generatedAt: new Date("2026-09-26T12:00:00Z"),
      }),
    ).toBe("whatsapp-history-aaaaaaaa-chats-2026-09-26.xlsx");
    expect(
      whatsappHistoryExportFilename({
        importId: "aaaaaaaa-0000-4000-8000-000000000001",
        dataset: "complete",
        format: "xlsx",
        generatedAt: new Date("2026-09-26T12:00:00Z"),
      }),
    ).toBe("whatsapp-history-aaaaaaaa-complete-2026-09-26.xlsx");
  });

  it("declara csv e xlsx como formatos aceitos", () => {
    expect(WHATSAPP_HISTORY_EXPORT_FORMATS).toEqual(["csv", "xlsx"]);
  });
});

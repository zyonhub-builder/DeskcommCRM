export const WHATSAPP_HISTORY_EXPORT_DATASETS = ["messages", "chats"] as const;

export type WhatsappHistoryExportDataset = (typeof WHATSAPP_HISTORY_EXPORT_DATASETS)[number];

export const WHATSAPP_HISTORY_MESSAGES_EXPORT_HEADER = [
  "import_id",
  "import_created_at",
  "import_full_sync",
  "import_retention_until",
  "chat_row_id",
  "chat_id_hash",
  "chat_kind",
  "chat_status",
  "message_id",
  "external_id_hash",
  "sent_at",
  "direction",
  "message_type",
  "body_length",
  "has_media",
  "media_mime",
  "created_at",
] as const;

export const WHATSAPP_HISTORY_CHATS_EXPORT_HEADER = [
  "import_id",
  "import_created_at",
  "import_full_sync",
  "import_retention_until",
  "chat_row_id",
  "chat_id_hash",
  "kind",
  "status",
  "messages_seen",
  "messages_imported",
  "media_skipped",
  "last_message_at",
  "created_at",
  "updated_at",
] as const;

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvLine(values: readonly unknown[]): string {
  return `${values.map(csvEscape).join(",")}\n`;
}

export function whatsappHistoryExportFilename(input: {
  importId: string;
  dataset: WhatsappHistoryExportDataset;
  generatedAt?: Date;
}): string {
  const date = (input.generatedAt ?? new Date()).toISOString().slice(0, 10);
  return `whatsapp-history-${input.importId.slice(0, 8)}-${input.dataset}-${date}.csv`;
}

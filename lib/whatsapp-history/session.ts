import { createHash, randomUUID } from "node:crypto";

import { nomeDeSessaoDeHistoricoCabeNoTransporte } from "@/lib/channels/history-session-name";

export const WHATSAPP_HISTORY_RETENTION_DAYS = 30;
export const WHATSAPP_HISTORY_PAGE_SIZE = 100;
export const WHATSAPP_HISTORY_MAX_CHATS_DEFAULT = 200;
export const WHATSAPP_HISTORY_MAX_MESSAGES_DEFAULT = 500;
export const WHATSAPP_HISTORY_CONSENT_VERSION = "whatsapp_history_v1";

export const WHATSAPP_HISTORY_STATUSES = [
  "qr_pending",
  "importing",
  "ready",
  "failed",
  "cancelled",
  "deleted",
  "expired",
] as const;

export type WhatsappHistoryStatus = (typeof WHATSAPP_HISTORY_STATUSES)[number];

export const WHATSAPP_HISTORY_TERMINAL_STATUSES = new Set<WhatsappHistoryStatus>([
  "ready",
  "failed",
  "cancelled",
  "deleted",
  "expired",
]);

export function nomeDaSessaoDeHistorico(organizationId: string, unico = randomUUID()): string {
  const org = organizationId.replaceAll("-", "").slice(0, 8);
  const sufixo = unico.replaceAll("-", "").slice(0, 32);
  const nome = `hist_${org}_${sufixo}`;
  if (!nomeDeSessaoDeHistoricoCabeNoTransporte(nome)) {
    throw new Error("whatsapp_history_session_name_invalid");
  }
  return nome;
}

export function hashWhatsappHistoryValue(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex");
}

export function retentionUntil(now = new Date()): string {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + WHATSAPP_HISTORY_RETENTION_DAYS);
  return value.toISOString();
}

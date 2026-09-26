import { describe, expect, it } from "vitest";

import {
  nomeDeSessaoDeHistoricoCabeNoTransporte,
  TETO_NOME_DE_SESSAO_DE_HISTORICO,
} from "@/lib/channels/history-session-name";
import { hashWhatsappHistoryValue, nomeDaSessaoDeHistorico, retentionUntil } from "./session";

describe("sessão temporária de histórico do WhatsApp", () => {
  it("gera nome que cabe no limite aceito pelo transporte", () => {
    const nome = nomeDaSessaoDeHistorico(
      "aaaaaaaa-0000-4000-8000-000000000001",
      "bbbbbbbb-1111-4000-8000-000000000002",
    );
    expect(nome).toBe("hist_aaaaaaaa_bbbbbbbb111140008000000000000002");
    expect(nome.length).toBeLessThanOrEqual(TETO_NOME_DE_SESSAO_DE_HISTORICO);
    expect(nomeDeSessaoDeHistoricoCabeNoTransporte(nome)).toBe(true);
  });

  it("hash não guarda o identificador remoto em claro", () => {
    const hash = hashWhatsappHistoryValue("5511999999999@c.us");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("5511999999999");
  });

  it("retenção padrão soma 30 dias em UTC", () => {
    expect(retentionUntil(new Date("2026-09-26T00:00:00.000Z"))).toBe("2026-10-26T00:00:00.000Z");
  });
});

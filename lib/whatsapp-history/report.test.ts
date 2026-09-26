import { describe, expect, it } from "vitest";

import {
  buildWhatsappHistoryReport,
  renderWhatsappHistoryReportMarkdown,
  sanitizeWhatsappHistoryMessageBody,
} from "./report";

const importRow = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  organization_id: "bbbbbbbb-0000-4000-8000-000000000002",
  status: "ready",
  max_chats: 200,
  max_messages_per_chat: 500,
  chats_total: 3,
  chats_imported: 3,
  messages_seen: 6,
  messages_imported: 6,
  media_skipped: 1,
  groups_skipped: 0,
  created_at: "2026-09-26T10:00:00.000Z",
  finished_at: "2026-09-26T10:05:00.000Z",
};

describe("relatório do histórico do WhatsApp", () => {
  it("aponta conversas sem resposta e calcula primeira resposta sem ler corpo", () => {
    const report = buildWhatsappHistoryReport({
      importRow,
      sampledMessages: 6,
      chats: [
        {
          id: "chat-1",
          status: "done",
          messages_seen: 2,
          messages_imported: 2,
          media_skipped: 0,
          last_message_at: "2026-09-26T10:10:00.000Z",
        },
        {
          id: "chat-2",
          status: "done",
          messages_seen: 2,
          messages_imported: 2,
          media_skipped: 1,
          last_message_at: "2026-09-26T11:30:00.000Z",
        },
        {
          id: "chat-3",
          status: "done",
          messages_seen: 2,
          messages_imported: 2,
          media_skipped: 0,
          last_message_at: "2026-09-26T12:10:00.000Z",
        },
      ],
      messages: [
        {
          chat_id: "chat-1",
          direction: "inbound",
          sent_at: "2026-09-26T10:00:00.000Z",
          has_media: false,
        },
        {
          chat_id: "chat-1",
          direction: "outbound",
          sent_at: "2026-09-26T10:10:00.000Z",
          has_media: false,
        },
        {
          chat_id: "chat-2",
          direction: "inbound",
          sent_at: "2026-09-26T11:00:00.000Z",
          has_media: false,
        },
        {
          chat_id: "chat-2",
          direction: "inbound",
          sent_at: "2026-09-26T11:30:00.000Z",
          has_media: true,
        },
        {
          chat_id: "chat-3",
          direction: "inbound",
          sent_at: "2026-09-26T12:00:00.000Z",
          has_media: false,
        },
        {
          chat_id: "chat-3",
          direction: "outbound",
          sent_at: "2026-09-26T12:10:00.000Z",
          has_media: false,
        },
      ],
    });

    expect(report.metrics.unanswered_chats).toBe(1);
    expect(report.metrics.chats_without_outbound).toBe(1);
    expect(report.metrics.median_first_response_minutes).toBe(10);
    expect(report.metrics.ai_used).toBe(false);
    expect(report.metrics.analysis_method).toBe("rules_v1");
    expect(report.limitations.join(" ")).toContain("não usa IA");
    expect(report.findings.map((finding) => finding.metric)).toEqual(
      expect.arrayContaining(["unanswered_chats", "chats_without_outbound", "media_skipped"]),
    );
    expect(JSON.stringify(report)).not.toContain("5511999999999");
  });

  it("declara limitação quando o relatório analisa só parte das mensagens", () => {
    const report = buildWhatsappHistoryReport({
      importRow: { ...importRow, messages_imported: 1000 },
      sampledMessages: 100,
      chats: [],
      messages: [],
    });

    expect(report.metrics.partial).toMatchObject({ report_sample_limited: true });
    expect(report.limitations.join(" ")).toContain("100 de 1000 mensagens");
    expect(report.findings.map((finding) => finding.metric)).toContain("partial_import_or_report");
  });

  it("sanitiza dados pessoais antes de montar a amostra para IA", () => {
    const sanitized = sanitizeWhatsappHistoryMessageBody(
      "Fale comigo em joana@example.com ou +55 11 99999-9999. CPF 123.456.789-10 https://x.test/a",
    );

    expect(sanitized).toContain("[email]");
    expect(sanitized).toContain("[telefone]");
    expect(sanitized).toContain("[documento]");
    expect(sanitized).toContain("[url]");
    expect(sanitized).not.toContain("joana@example.com");
    expect(sanitized).not.toContain("99999-9999");
  });

  it("renderiza relatório markdown com FAQs e melhorias sem corpo bruto", () => {
    const markdown = renderWhatsappHistoryReportMarkdown(
      {
        id: "report-1",
        report_version: "whatsapp_history_ai_report_v1",
        summary: "Clientes pedem preço e ficam sem próximo passo claro.",
        metrics: {
          analysis_method: "ai_v1",
          ai_faqs: [
            {
              question: "Qual é o preço?",
              evidence: "Dúvida apareceu em chats diferentes.",
              suggested_answer: "Enviar tabela atualizada e prazo de validade.",
            },
          ],
          ai_improvements: ["Criar macro de preço", "Configurar follow-up de proposta"],
        },
        findings: [
          {
            severity: "high",
            title: "Sem próximo passo",
            detail: "Propostas não recebem follow-up claro.",
            metric: "followup_gap",
            next_step: "Criar retorno automático após proposta.",
          },
        ],
        limitations: ["Amostra sanitizada."],
        generated_at: "2026-09-26T12:00:00.000Z",
        created_at: "2026-09-26T12:00:00.000Z",
        updated_at: "2026-09-26T12:00:00.000Z",
      },
      { importId: importRow.id },
    );

    expect(markdown).toContain("FAQs");
    expect(markdown).toContain("Qual é o preço?");
    expect(markdown).toContain("Criar macro de preço");
    expect(markdown).not.toContain("joana@example.com");
  });
});

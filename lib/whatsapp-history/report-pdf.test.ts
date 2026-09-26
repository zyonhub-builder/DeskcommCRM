// @vitest-environment node
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import type { WhatsappHistoryReportRow } from "./report";
import { renderWhatsappHistoryReportPdf } from "./report-pdf";

function report(): WhatsappHistoryReportRow {
  return {
    id: "relatorio-1",
    report_version: "whatsapp_history_ai_report_v1",
    summary: "Clientes pedem preco, prazo e garantia, mas ficam sem proximo passo claro.",
    metrics: {
      analysis_method: "ai",
      ai_used: true,
      unanswered_chats: 3,
      chats_without_outbound: 5,
      median_first_response_minutes: 42,
      inbound_outside_business_hours_percent: 18,
      ai_messages_sampled: 120,
      ai_chats_sampled: 12,
      ai_faqs: [
        {
          question: "Qual e o preco?",
          evidence: "Pergunta aparece em varias conversas antes da proposta.",
          suggested_answer: "Responder faixa de preco e pedir dados minimos para proposta.",
        },
      ],
      ai_improvements: [
        "Criar macro de preco com criterios de qualificacao.",
        "Configurar follow-up para proposta sem retorno.",
      ],
    },
    findings: [
      {
        severity: "high",
        title: "Propostas sem retorno claro",
        detail: "Atendimentos passam preco, mas nem sempre deixam uma proxima acao objetiva.",
        metric: "next_step_gap",
        next_step: "Padronizar encerramento com pergunta de avanco e prazo de follow-up.",
      },
      {
        severity: "medium",
        title: "FAQ de preco concentrada",
        detail: "O mesmo tema aparece repetidamente e pode virar resposta pronta.",
        metric: "faq_price",
        next_step: "Adicionar resposta sugerida na base de conhecimento.",
      },
    ],
    limitations: ["Amostra textual sanitizada; mensagens completas ficam apenas no XLSX."],
    generated_at: "2030-01-02T13:05:00Z",
    created_at: "2030-01-02T13:05:00Z",
    updated_at: "2030-01-02T13:05:00Z",
  };
}

async function rendered(data: WhatsappHistoryReportRow) {
  const bytes = await renderWhatsappHistoryReportPdf(data, {
    importId: "aaaaaaaa-0000-4000-8000-000000000001",
  });
  const fonts =
    join(
      dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")),
      "standard_fonts",
    ) + sep;
  const task = getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: fonts });
  const document = await task.promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return { bytes, pages: document.numPages, text: pages.join("\n").replace(/\s+/g, " ") };
  } finally {
    await task.destroy();
  }
}

describe("PDF do relatorio de historico do WhatsApp", () => {
  it("gera um PDF visual com resumo, metricas, FAQs e melhorias", async () => {
    const pdf = await rendered(report());
    const header = Buffer.from(pdf.bytes.subarray(0, 5)).toString("latin1");

    expect(header).toBe("%PDF-");
    expect(pdf.pages).toBeGreaterThan(0);
    expect(pdf.text).toContain("Relatório de análise de conversas");
    expect(pdf.text).toContain("Painel rapido");
    expect(pdf.text).toContain("Clientes pedem preco");
    expect(pdf.text).toContain("Propostas sem retorno claro");
    expect(pdf.text).toContain("Qual e o preco?");
    expect(pdf.text).toContain("Criar macro de preco");
    expect(pdf.text).toContain("mensagens completas ficam apenas no XLSX");
  });
});

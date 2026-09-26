import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildXlsxWorkbook } from "./xlsx";

describe("xlsx do histórico do WhatsApp", () => {
  it("gera um workbook mínimo com strings escapadas e aba nomeada", () => {
    const workbook = buildXlsxWorkbook([
      {
        name: "Mensagens",
        rows: [
          ["nome", "valor"],
          ['a "b" & c', 10],
        ],
      },
    ]);

    const files = unzipSync(workbook);
    expect(files["xl/workbook.xml"]).toBeDefined();
    expect(files["xl/worksheets/sheet1.xml"]).toBeDefined();

    const workbookXml = strFromU8(files["xl/workbook.xml"]!);
    const sheetXml = strFromU8(files["xl/worksheets/sheet1.xml"]!);

    expect(workbookXml).toContain('name="Mensagens"');
    expect(sheetXml).toContain("a &quot;b&quot; &amp; c");
    expect(sheetXml).toContain("<v>10</v>");
  });

  it("gera múltiplas abas no mesmo arquivo", () => {
    const workbook = buildXlsxWorkbook([
      {
        name: "Conversas",
        rows: [["chat_row_id"], ["chat-1"]],
      },
      {
        name: "Mensagens",
        rows: [["body"], ["Mensagem completa"]],
      },
    ]);

    const files = unzipSync(workbook);
    const workbookXml = strFromU8(files["xl/workbook.xml"]!);
    const secondSheetXml = strFromU8(files["xl/worksheets/sheet2.xml"]!);

    expect(workbookXml).toContain('name="Conversas"');
    expect(workbookXml).toContain('name="Mensagens"');
    expect(files["xl/worksheets/sheet1.xml"]).toBeDefined();
    expect(files["xl/worksheets/sheet2.xml"]).toBeDefined();
    expect(secondSheetXml).toContain("Mensagem completa");
  });
});

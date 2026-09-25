import { describe, expect, it } from "vitest";

import { ALVO_DE_FUNIL } from "@/lib/leads/escopo-de-funil";
import type { McpContext } from "@/lib/mcp/types";
import { allTools } from "@/lib/mcp/tools";
import { TOOL_CATALOG, deModuloDesligado } from "@/lib/mcp/tools/catalog";
import {
  crmCreateZapsignDocument,
  crmGetZapsignDocument,
  crmListZapsignDocuments,
  redigirCriacaoZapsignParaAuditoria,
} from "@/lib/mcp/tools/zapsign";

const ORG = "11111111-1111-4111-8111-111111111111";

describe("tools ZapSign", () => {
  it("declara as três capacidades no runtime e no catálogo", () => {
    const nomesRuntime = new Set(allTools.map((t) => t.name));
    const catalogo = new Map(TOOL_CATALOG.map((t) => [t.name, t]));

    for (const name of [
      "crm_create_zapsign_document",
      "crm_get_zapsign_document",
      "crm_list_zapsign_documents",
    ]) {
      expect(nomesRuntime.has(name)).toBe(true);
      expect(catalogo.get(name)?.modulo).toBe("zapsign");
      expect(deModuloDesligado(name, [])).toBe(true);
      expect(deModuloDesligado(name, ["zapsign"])).toBe(false);
    }
  });

  it("classifica criação como escrita crítica, escopada por negócio quando houver", () => {
    expect(crmCreateZapsignDocument.category).toBe("write");
    expect(crmCreateZapsignDocument.requiresRole).toBe("ai_operator");
    expect(crmCreateZapsignDocument.requiresScope).toBe("mcp:write");
    expect(ALVO_DE_FUNIL["crm_create_zapsign_document"]).toBe("funil_vem_do_lead");

    const entradaCatalogo = TOOL_CATALOG.find((t) => t.name === "crm_create_zapsign_document");
    expect(entradaCatalogo?.risco).toBe("critico");
  });

  it("mantém consultas como leitura", () => {
    expect(crmGetZapsignDocument.category).toBe("read");
    expect(crmGetZapsignDocument.requiresScope).toBe("mcp:read");
    expect(crmListZapsignDocuments.category).toBe("read");
    expect(crmListZapsignDocuments.requiresScope).toBe("mcp:read");
  });

  it("redige arquivo, signatários e dados de modelo antes do audit", () => {
    const redigido = redigirCriacaoZapsignParaAuditoria({
      base64_pdf: "JVBERi0xLjQKconteudo",
      template_data: { cpf: "123.456.789-00", nome: "Ana" },
      signers: [
        {
          name: "Ana Cliente",
          email: "ana@example.test",
          send_automatic_email: true,
        },
      ],
      raw_options: {
        signer: { phone_country: "55", phone_number: "11999999999" },
      },
    });

    expect(redigido.base64_pdf).toBe("<redacted>");
    expect(redigido.signers).toEqual({ quantidade: 1, envio_automatico: true });
    expect(redigido.template_data).toEqual({ campos: ["cpf", "nome"] });
    expect(JSON.stringify(redigido)).not.toContain("ana@example.test");
    expect(JSON.stringify(redigido)).not.toContain("11999999999");
  });

  it("recusa criação com envio automático sem confirmação explícita antes de tocar o banco", async () => {
    const ctx = {
      organizationId: ORG,
      role: "ai_operator",
      actor: { type: "ai_agent", id: "run-1", role: "ai_operator" },
      apiTokenId: "token-1",
      requestId: "req-1",
      supabase: new Proxy(
        {},
        {
          get() {
            throw new Error("não deveria tocar o banco");
          },
        },
      ),
    } as unknown as McpContext;

    const resultado = await crmCreateZapsignDocument.handler(
      {
        modo: "modelo",
        template_id: "tpl-1",
        signers: [{ email: "ana@example.test", send_automatic_email: "true" }],
        confirmou_envio_externo: false,
      },
      ctx,
    );

    expect(resultado).toEqual({
      criado: false,
      motivo: "confirmacao_necessaria",
      mensagem: "o pedido pode disparar convite fora do sistema. Confirme explicitamente antes de criar.",
    });
  });
});

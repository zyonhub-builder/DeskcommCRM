import { describe, expect, it, vi } from "vitest";

import { ZapSignClient, zapsignBaseUrl } from "@/lib/zapsign/client";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ZapSignClient", () => {
  it("usa bearer token e monta os caminhos oficiais de documento", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json([{ token: "doc-1" }]));
    const client = new ZapSignClient({
      apiToken: "secret-token",
      baseUrl: "https://zap.local/",
      fetchImpl,
    });

    await client.listDocuments({ page: 2, status: "pending" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://zap.local/api/v1/docs/?page=2&status=pending",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers;
    if (!(headers instanceof Headers)) throw new Error("fetch recebeu headers fora do contrato");
    expect(headers.get("Authorization")).toBe("Bearer secret-token");
  });

  it("cria por modelo no endpoint de modelos e por arquivo no endpoint de documentos", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ token: "doc-1" }));
    const client = new ZapSignClient({
      apiToken: "secret-token",
      baseUrl: "https://zap.local",
      fetchImpl,
    });

    await client.createDocumentFromTemplate({ template_id: "tpl" });
    await client.createDocument({ url_pdf: "https://example.test/doc.pdf" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://zap.local/api/v1/models/create-doc/");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://zap.local/api/v1/docs/");
  });

  it("propaga status e detalhe de erro da ZapSign", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ detail: "token inválido" }, 401));
    const client = new ZapSignClient({
      apiToken: "bad-token",
      baseUrl: "https://zap.local",
      fetchImpl,
    });

    await expect(client.getDocument("doc-1")).rejects.toMatchObject({
      name: "ZapSignApiError",
      status: 401,
      message: "zapsign_api_error: token inválido",
    });
  });

  it("resolve a URL de produção e sandbox sem barra final", () => {
    expect(zapsignBaseUrl({ sandbox: false })).toBe("https://api.zapsign.com.br");
    expect(zapsignBaseUrl({ sandbox: true })).toBe("https://sandbox.api.zapsign.com.br");
    expect(zapsignBaseUrl({ baseUrl: "https://zap.local///", sandbox: false })).toBe("https://zap.local");
  });
});

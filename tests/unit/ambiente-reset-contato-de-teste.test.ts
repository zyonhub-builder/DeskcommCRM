import { describe, expect, it } from "vitest";

import { ambientePermiteResetDeTeste } from "@/lib/lab/ambiente-de-teste";

describe("ambientePermiteResetDeTeste", () => {
  it("libera dev local e teste automatizado mesmo sem URL pública", () => {
    expect(ambientePermiteResetDeTeste(undefined, "development")).toBe(true);
    expect(ambientePermiteResetDeTeste(undefined, "test")).toBe(true);
  });

  it("libera hosts de laboratório publicados com prefixo dev", () => {
    expect(ambientePermiteResetDeTeste("https://dev-crm.zeyno.dev.br", "production")).toBe(true);
    expect(ambientePermiteResetDeTeste("https://dev.zeyno.dev.br", "production")).toBe(true);
  });

  it("não libera a URL de produção nem domínio coringa por acaso", () => {
    expect(ambientePermiteResetDeTeste("https://crm.zeyno.dev.br", "production")).toBe(false);
    expect(ambientePermiteResetDeTeste("https://82-25-74-35.sslip.io", "production")).toBe(false);
    expect(ambientePermiteResetDeTeste("valor quebrado", "production")).toBe(false);
  });
});

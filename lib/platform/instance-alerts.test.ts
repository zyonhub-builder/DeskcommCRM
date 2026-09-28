import { describe, expect, it } from "vitest";

import {
  destinoDoAvisoEhValido,
  mascararDestinoDoAvisoDeInstancia,
  normalizarDestinoDoAvisoDeInstancia,
} from "./instance-alerts";

describe("avisos globais de instância", () => {
  it("normaliza telefone para E.164 simples", () => {
    expect(normalizarDestinoDoAvisoDeInstancia("phone", " (55) 11 99999-9999 ")).toBe(
      "+5511999999999",
    );
  });

  it("normaliza JID de grupo sem alterar o identificador", () => {
    expect(normalizarDestinoDoAvisoDeInstancia("group", " 120363000000000000@G.US ")).toBe(
      "120363000000000000@g.us",
    );
  });

  it("mascara telefone e grupo sem expor o destino completo", () => {
    expect(mascararDestinoDoAvisoDeInstancia("+5511999999999", "phone")).toBe("••••9999");
    expect(mascararDestinoDoAvisoDeInstancia("120363000000000000@g.us", "group")).toBe(
      "grupo ••••0000",
    );
  });

  it("valida os dois formatos aceitos pelo banco", () => {
    expect(destinoDoAvisoEhValido("phone", "+5511999999999")).toBe(true);
    expect(destinoDoAvisoEhValido("group", "120363000000000000@g.us")).toBe(true);
    expect(destinoDoAvisoEhValido("phone", "5511999999999")).toBe(false);
    expect(destinoDoAvisoEhValido("group", "+5511999999999")).toBe(false);
  });
});

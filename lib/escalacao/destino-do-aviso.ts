/**
 * O destino do aviso de caso: telefone 1:1 ou grupo do WhatsApp.
 *
 * A coluna histórica chama `telefone_destino`, e o contrato da rota ainda usa
 * `telefone` por compatibilidade. Este módulo é o dono do significado novo:
 * pode ser E.164 (`+55...`) ou JID de grupo (`120363...@g.us`).
 */

const E164 = /^\+[1-9][0-9]{7,14}$/;
const GRUPO_WHATSAPP = /^[0-9]{6,}@g\.us$/;

export type TipoDeDestinoDoAviso = "telefone" | "grupo";

export function tipoDeDestinoDoAviso(
  bruto: string | null | undefined,
): TipoDeDestinoDoAviso | null {
  if (typeof bruto !== "string") return null;
  const destino = bruto.trim();
  if (E164.test(destino)) return "telefone";
  if (GRUPO_WHATSAPP.test(destino)) return "grupo";
  return null;
}

export function destinoDeAvisoValido(bruto: string | null | undefined): boolean {
  return tipoDeDestinoDoAviso(bruto) !== null;
}

export function destinoDeAvisoEhGrupo(bruto: string | null | undefined): boolean {
  return tipoDeDestinoDoAviso(bruto) === "grupo";
}

/**
 * O que a pessoa digitou, na forma que o banco aceita.
 *
 * Sem `@`, tratamos como telefone e mantemos a máscara universal do produto:
 * `+` na frente, dígitos atrás. Com `@`, tratamos como identificador de grupo e
 * só normalizamos espaços/caixa. Não tentamos converter link de convite em ID:
 * isso depende do adaptador de canal resolver o convite para o grupo real.
 */
export function normalizarDestinoDeAviso(bruto: string): string {
  const aparado = bruto.trim();
  if (aparado.includes("@")) return aparado.toLowerCase().replace(/\s+/g, "");

  const digitos = bruto.replace(/\D/g, "");
  return digitos === "" ? "" : `+${digitos}`;
}

/** Os quatro últimos dígitos, sem expor o destino inteiro. */
export function mascararDestinoDoAviso(destino: string | null | undefined): string {
  if (!destino) return "••••";
  if (destinoDeAvisoEhGrupo(destino)) {
    const id = destino.split("@")[0] ?? "";
    return id.length <= 4 ? "grupo ••••" : `grupo ••••${id.slice(-4)}`;
  }

  const digitos = destino.replace(/\D/g, "");
  return digitos.length <= 4 ? "••••" : `••••${digitos.slice(-4)}`;
}

import { nomeDaSessaoCabeNoWaha, TETO_NOME_DE_SESSAO_WAHA } from "@/lib/channels/nome-da-sessao";

export const TETO_NOME_DE_SESSAO_DE_HISTORICO = TETO_NOME_DE_SESSAO_WAHA;

export function nomeDeSessaoDeHistoricoCabeNoTransporte(nome: string): boolean {
  return nomeDaSessaoCabeNoWaha(nome);
}

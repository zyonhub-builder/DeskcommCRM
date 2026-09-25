/**
 * Capacidades de assinatura eletrônica.
 *
 * O módulo é opcional porque guarda credencial de provedor e pode disparar
 * convite fora do sistema. Com o módulo desligado, estas capacidades não são
 * oferecidas ao agente nem a clientes externos.
 */
import { declararTools } from "./tipos";

export const TOOLS_ZAPSIGN = declararTools([
  {
    name: "crm_list_zapsign_documents",
    category: "read",
    rotulo: "Ver documentos para assinatura",
    explicacao:
      "Mostra contratos e propostas enviados para assinatura, com situação atual e vínculo com cliente ou negócio, para o assistente saber se já foi assinado.",
    oQueToca: "Assinaturas eletrônicas",
    risco: "seguro",
    pacotes: ["vender", "atender"],
    modulo: "zapsign",
  },
  {
    name: "crm_get_zapsign_document",
    category: "read",
    rotulo: "Consultar assinatura",
    explicacao:
      "Abre os detalhes de um documento de assinatura e mostra situação, pessoas envolvidas e datas importantes, para responder sem adivinhar.",
    oQueToca: "Assinaturas eletrônicas",
    risco: "seguro",
    pacotes: ["vender", "atender"],
    modulo: "zapsign",
  },
  {
    name: "crm_create_zapsign_document",
    category: "write",
    rotulo: "Enviar documento para assinatura",
    explicacao:
      "Cria um documento na ZapSign para outra pessoa assinar. Pode disparar convite fora do sistema quando essa opção estiver marcada, por isso precisa de revisão.",
    oQueToca: "Assinaturas eletrônicas",
    risco: "critico",
    pacotes: ["vender", "atender"],
    modulo: "zapsign",
  },
]);

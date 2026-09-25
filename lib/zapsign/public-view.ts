export type ZapsignDocumentoResumo = {
  id: string;
  token: string | null;
  external_id: string | null;
  name: string | null;
  status: string | null;
  lead_id: string | null;
  contact_id: string | null;
  last_event_type: string | null;
  last_event_at: string | null;
  signed_at: string | null;
  refused_at: string | null;
  expired_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function textoOuNull(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim().length > 0 ? valor : null;
}

/**
 * Projeção para navegador: sem `signers`, sem payload do provedor e sem campo
 * livre que possa carregar e-mail, telefone ou conteúdo do contrato.
 */
export function resumoPublicoDocumentoZapsign(row: Record<string, unknown>): ZapsignDocumentoResumo {
  return {
    id: textoOuNull(row.id) ?? "",
    token: textoOuNull(row.token ?? row.external_token),
    external_id: textoOuNull(row.external_id),
    name: textoOuNull(row.name),
    status: textoOuNull(row.status),
    lead_id: textoOuNull(row.lead_id),
    contact_id: textoOuNull(row.contact_id),
    last_event_type: textoOuNull(row.last_event_type),
    last_event_at: textoOuNull(row.last_event_at),
    signed_at: textoOuNull(row.signed_at),
    refused_at: textoOuNull(row.refused_at),
    expired_at: textoOuNull(row.expired_at),
    created_at: textoOuNull(row.created_at),
    updated_at: textoOuNull(row.updated_at),
  };
}

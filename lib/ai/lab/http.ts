import "server-only";

import { fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { ambientePermiteResetDeTeste } from "@/lib/lab/ambiente-de-teste";

export function laboratorioDeJornadasHabilitado(): boolean {
  return ambientePermiteResetDeTeste(env.NEXT_PUBLIC_APP_URL, process.env.NODE_ENV);
}

export function recusarLaboratorioForaDeTeste(requestId: string): Response | null {
  if (laboratorioDeJornadasHabilitado()) return null;
  return fail(
    "forbidden",
    "O laboratório de jornadas reais só fica disponível em ambiente de teste.",
    403,
    { requestId },
  );
}

export function failDoLaboratorio(error: unknown, requestId: string): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "cenario_nao_encontrado") {
    return fail("not_found", "Cenário não encontrado.", 404, { requestId });
  }
  if (message === "rodada_nao_encontrada") {
    return fail("not_found", "Rodada não encontrada.", 404, { requestId });
  }
  if (message === "cenario_inativo") {
    return fail("state_conflict", "Esse cenário está inativo.", 409, { requestId });
  }
  if (message === "cenario_sem_canal") {
    return fail("validation_failed", "Escolha uma conexão para rodar esse cenário.", 422, {
      requestId,
    });
  }
  if (message === "canal_nao_encontrado") {
    return fail("validation_failed", "A conexão escolhida não está disponível.", 422, {
      requestId,
    });
  }
  return fail("internal_error", message, 500, { requestId });
}

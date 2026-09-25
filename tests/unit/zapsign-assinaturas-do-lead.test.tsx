import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssinaturasZapsignDoLead } from "@/components/zapsign/ListaDeAssinaturasZapsign";

const estado = vi.hoisted(() => ({
  modulos: [] as string[],
}));

const get = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => get(...args) },
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { modulos_ligados: estado.modulos } }),
}));

function renderComQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AssinaturasZapsignDoLead leadId="11111111-1111-4111-8111-111111111111" />
    </QueryClientProvider>,
  );
}

describe("AssinaturasZapsignDoLead", () => {
  beforeEach(() => {
    get.mockReset();
    estado.modulos = [];
  });

  it("não monta nada quando o módulo ZapSign está desligado", () => {
    const view = renderComQuery();
    expect(view.container.textContent).toBe("");
    expect(get).not.toHaveBeenCalled();
  });

  it("busca documentos pelo lead e mostra o status no dossiê", async () => {
    estado.modulos = ["zapsign"];
    get.mockResolvedValue({
      data: {
        documentos: [
          {
            id: "doc-1",
            token: "token-zap",
            name: "Contrato assinado",
            status: "signed",
            lead_id: "11111111-1111-4111-8111-111111111111",
            updated_at: "2026-09-25T12:00:00Z",
          },
        ],
      },
    });

    renderComQuery();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get.mock.calls[0]?.[0]).toContain("lead_id=11111111-1111-4111-8111-111111111111");
    expect(await screen.findByText("Contrato assinado")).toBeInTheDocument();
    expect(screen.getByText("Assinado")).toBeInTheDocument();
  });
});

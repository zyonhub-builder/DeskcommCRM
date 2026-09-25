import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CRMSidePanel } from "@/components/inbox/CRMSidePanel";

const CONTACT = "c0000000-0000-4000-8000-000000000001";

const conversation = {
  id: "cv-1",
  organization_id: "org-1",
  contact_id: CONTACT,
  tags: [],
  contacts: { id: CONTACT, display_name: "Fulana", name: null, phone_number: "5511999", tags: [] },
} as unknown as React.ComponentProps<typeof CRMSidePanel>["conversation"];

const get = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => get(...args), post: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/hooks/pipelines/useDefaultPipeline", () => ({
  useDefaultPipeline: () => ({ data: null, isError: false }),
}));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useUpdateConversationTags: () => ({ mutate: vi.fn(), isPending: false }),
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { support: null },
    activeOrg: { modulos_ligados: ["zapsign"] },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPainel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CRMSidePanel conversation={conversation} />
    </QueryClientProvider>,
  );
}

describe("painel do inbox — assinaturas ZapSign", () => {
  beforeEach(() => get.mockReset());

  it("mostra documentos de assinatura do contato junto do atendimento", async () => {
    get.mockResolvedValue({
      data: {
        leads: [],
        orders: [],
        activities: [],
        demandas: [],
        fatos: [],
        historico: [],
        zapsign_documents: [
          {
            id: "doc-1",
            token: "token-zap",
            name: "Contrato de teste",
            status: "signed",
            lead_id: null,
            contact_id: CONTACT,
            last_event_type: "doc_signed",
            last_event_at: "2026-09-25T12:00:00Z",
          },
        ],
      },
    });

    renderPainel();

    const secao = await screen.findByTestId("inbox-zapsign-documents");
    expect(secao.textContent).toContain("Assinaturas");
    expect(secao.textContent).toContain("Contrato de teste");
    expect(secao.textContent).toContain("Assinado");
    expect(secao.textContent).toContain("doc_signed");
  });
});

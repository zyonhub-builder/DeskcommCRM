"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/types";
import type { ZapsignDocumentoResumo } from "@/lib/zapsign/public-view";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import { FileText } from "@/lib/ui/icons";

export type { ZapsignDocumentoResumo } from "@/lib/zapsign/public-view";

function variantDoStatus(status: string | null): "neutral" | "success" | "warning" | "error" {
  const s = (status ?? "").toLowerCase();
  if (s === "signed") return "success";
  if (s === "refused" || s === "expired") return "error";
  if (s === "pending" || s === "created") return "warning";
  return "neutral";
}

function rotuloDoStatus(status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "signed":
      return "Assinado";
    case "refused":
      return "Recusado";
    case "expired":
      return "Expirado";
    case "pending":
      return "Pendente";
    case "created":
      return "Criado";
    default:
      return status || "Status desconhecido";
  }
}

function dataDoDocumento(doc: ZapsignDocumentoResumo): string | null {
  return doc.last_event_at ?? doc.updated_at ?? doc.created_at;
}

export function ListaDeAssinaturasZapsign({
  documentos,
  loading,
  error,
  onRetry,
  emptyText = "Sem documentos para assinatura.",
  compacta = false,
}: {
  documentos: readonly ZapsignDocumentoResumo[] | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  emptyText?: string;
  compacta?: boolean;
}) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();

  if (loading) return <Skeleton className={compacta ? "mt-2 h-14 w-full" : "h-20 w-full"} />;

  if (error) {
    return (
      <div className="mt-2 space-y-2 text-xs">
        <p className="text-error-fg">{t("Não consegui ler as assinaturas.")}</p>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t("Tentar de novo")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (!documentos || documentos.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">{t(emptyText)}</p>;
  }

  return (
    <ul className={cn("space-y-1.5", compacta ? "mt-2" : "")}>
      {documentos.map((doc) => {
        const data = dataDoDocumento(doc);
        return (
          <li key={doc.id || doc.token || doc.name} className="rounded-md border border-border p-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5 font-medium">
                  <FileText size={12} aria-hidden className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{doc.name ?? t("Documento sem nome")}</span>
                </div>
                <div className="mt-0.5 truncate text-muted-foreground">
                  {doc.token ?? doc.external_id ?? "—"}
                </div>
              </div>
              <Badge variant={variantDoStatus(doc.status)}>{t(rotuloDoStatus(doc.status))}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
              {data ? <span>{new Date(data).toLocaleString(tagDoIdioma)}</span> : null}
              {doc.last_event_type ? <span>{doc.last_event_type}</span> : null}
              {doc.lead_id ? (
                <Link className="text-accent underline-offset-2 hover:underline" href={`/app/kanban?lead=${doc.lead_id}`}>
                  {t("Lead vinculado")}
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AssinaturasZapsignDoLead({
  leadId,
  className,
}: {
  leadId: string;
  className?: string;
}) {
  const { activeOrg } = useAuth();
  const ligado = activeOrg?.modulos_ligados?.includes("zapsign") === true;
  const query = useQuery({
    queryKey: ["zapsign", "documents", "lead", leadId],
    enabled: ligado,
    queryFn: async () => {
      const response = await apiClient.get<ApiSuccess<{ documentos: ZapsignDocumentoResumo[] }>>(
        `/api/v1/integrations/zapsign/documents?lead_id=${encodeURIComponent(leadId)}&limite=5`,
      );
      return response.data.documentos;
    },
  });

  const t = useT();
  if (!ligado) return null;

  return (
    <section className={cn("border-b border-border py-3", className)}>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {t("Assinaturas deste negócio")}
      </h3>
      <ListaDeAssinaturasZapsign
        documentos={query.data ?? null}
        loading={query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        compacta
      />
    </section>
  );
}

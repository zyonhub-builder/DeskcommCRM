import Link from "next/link";
import { redirect } from "next/navigation";

import { ZapSignCreateDocumentClient } from "./_components/ZapSignCreateDocumentClient";
import { ZapSignConfigClient } from "./_components/ZapSignConfigClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { env } from "@/lib/env";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileText } from "@/lib/ui/icons";
import {
  buscarIntegracaoZapsign,
  listarDocumentosZapsign,
  visaoPublicaDaIntegracao,
} from "@/lib/zapsign/service";

export const metadata = { title: "ZapSign" };
export const dynamic = "force-dynamic";

function absoluto(path: string | null): string | null {
  if (!path) return null;
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${path}`;
}

function statusVariant(status: unknown): "neutral" | "success" | "warning" | "error" {
  const s = String(status ?? "").toLowerCase();
  if (s === "signed") return "success";
  if (s === "refused" || s === "expired") return "error";
  if (s === "pending" || s === "created") return "warning";
  return "neutral";
}

function textoCurto(valor: unknown): string {
  return typeof valor === "string" && valor.trim().length > 0 ? valor : "—";
}

export default async function ZapSignPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const t = (texto: string) => traduzir(texto, user.idioma);
  const admin = createAdminClient();
  const row = await buscarIntegracaoZapsign(admin, activeOrg.orgId);
  const integracao = visaoPublicaDaIntegracao(row);
  const documentos = await listarDocumentosZapsign(admin, {
    organizationId: activeOrg.orgId,
    limite: 20,
  });

  const initial = {
    ...integracao,
    webhook_url: absoluto(integracao.webhook_path),
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-md border border-border bg-surface p-3">
            <FileText size={28} weight="duotone" className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">ZapSign</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t(
                "Conecte assinatura eletrônica para a IA enviar contratos e acompanhar o retorno pelo webhook.",
              )}
            </p>
          </div>
        </div>
        <Badge variant={integracao.connected ? "success" : "neutral"}>
          {integracao.connected ? t("Conectada") : t("Não conectada")}
        </Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <ZapSignConfigClient initial={initial} />
          <ZapSignCreateDocumentClient connected={integracao.connected} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("Como a ZapSign entra no atendimento")}</CardTitle>
            <CardDescription>
              {t("O agente usa esta conexão quando uma capacidade ZapSign está ligada no agente.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{t("1. O agente cria o documento pela ferramenta ZapSign.")}</p>
            <p>{t("2. O documento fica registrado nesta tela com o lead ou contato vinculado.")}</p>
            <p>{t("3. Quando a ZapSign chama o webhook, o status local é atualizado aqui.")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Documentos recentes")}</CardTitle>
          <CardDescription>
            {t("Últimos documentos criados pelo agente, API ou webhook da ZapSign.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documentos.documentos.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t("Nenhum documento ZapSign registrado ainda.")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Documento")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Vínculo")}</TableHead>
                  <TableHead>{t("Último evento")}</TableHead>
                  <TableHead className="text-right">{t("Atualizado em")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.documentos.map((doc) => (
                  <TableRow key={String(doc.id)}>
                    <TableCell className="min-w-[220px]">
                      <div className="font-medium">{textoCurto(doc.name)}</div>
                      <div className="text-xs text-muted-foreground">{textoCurto(doc.token)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(doc.status)}>{textoCurto(doc.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {typeof doc.lead_id === "string" && doc.lead_id ? (
                          <Link className="text-accent hover:underline" href={`/app/kanban?lead=${doc.lead_id}`}>
                            {t("Lead vinculado")}
                          </Link>
                        ) : null}
                        {typeof doc.contact_id === "string" && doc.contact_id ? (
                          <Link className="text-accent hover:underline" href={`/app/contacts/${doc.contact_id}`}>
                            {t("Contato vinculado")}
                          </Link>
                        ) : null}
                        {!doc.lead_id && !doc.contact_id ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{textoCurto(doc.last_event_type)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {typeof doc.updated_at === "string" && doc.updated_at
                        ? new Date(doc.updated_at).toLocaleString(tagDeIdioma(user.idioma))
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

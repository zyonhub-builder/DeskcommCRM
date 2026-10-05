"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, History, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import {
  useDiagnosticoComercial,
  useRelatoriosDiagnosticoComercial,
} from "@/hooks/metrics/useDiagnosticoComercial";
import { apiClient } from "@/lib/api/client";
import { formatCentsUSD } from "@/lib/money";
import type { AnaliseIaDiagnosticoComercialPayload } from "@/lib/metrics/diagnostico-comercial-ai";
import type { RelatorioAnaliseIaDiagnosticoComercial } from "@/lib/metrics/diagnostico-comercial-reports";
import type {
  DiagnosticoComercialPayload,
  SinalDiagnostico,
} from "@/lib/metrics/diagnostico-comercial";

type Periodo = 7 | 30 | 90;

function inteiro(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

function percentual(valor: number | null): string {
  if (valor === null) return "—";
  return `${Math.round(valor * 100)}%`;
}

function duracao(segundos: number | null): string {
  if (segundos === null) return "—";
  if (segundos < 60) return `${Math.round(segundos)}s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)}min`;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.round((segundos % 3600) / 60);
  return minutos > 0 ? `${horas}h ${minutos}min` : `${horas}h`;
}

function varianteDoSinal(nivel: SinalDiagnostico["nivel"]) {
  if (nivel === "critico") return "error" as const;
  if (nivel === "atencao") return "warning" as const;
  if (nivel === "bom") return "success" as const;
  return "neutral" as const;
}

function rotuloNivel(nivel: SinalDiagnostico["nivel"], t: (texto: string) => string): string {
  if (nivel === "critico") return t("Crítico");
  if (nivel === "atencao") return t("Atenção");
  if (nivel === "bom") return t("Bom");
  return t("Informativo");
}

function variantePrioridade(prioridade: "baixa" | "media" | "alta") {
  if (prioridade === "alta") return "error" as const;
  if (prioridade === "media") return "warning" as const;
  return "neutral" as const;
}

function rotuloPrioridade(
  prioridade: "baixa" | "media" | "alta",
  t: (texto: string) => string,
): string {
  if (prioridade === "alta") return t("Alta");
  if (prioridade === "media") return t("Média");
  return t("Baixa");
}

function custoDaAnalise(cents: number | null, t: (texto: string) => string): string {
  return cents === null ? t("preço indisponível") : formatCentsUSD(cents);
}

function nomeArquivoPdf(janela?: DiagnosticoComercialPayload["janela"]): string {
  const data = (janela?.to ?? new Date().toISOString()).slice(0, 10);
  return `diagnostico-comercial-ia-${data}.pdf`;
}

function dataHora(iso: string, tagDoIdioma: string): string {
  return new Intl.DateTimeFormat(tagDoIdioma, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function janelaLegivel(
  janela: RelatorioAnaliseIaDiagnosticoComercial["janela"],
  tagDoIdioma: string,
): string {
  const from = new Intl.DateTimeFormat(tagDoIdioma, { day: "2-digit", month: "2-digit" }).format(
    new Date(janela.from),
  );
  const to = new Intl.DateTimeFormat(tagDoIdioma, { day: "2-digit", month: "2-digit" }).format(
    new Date(janela.to),
  );
  return `${janela.dias}d · ${from}–${to}`;
}

async function baixarPdfDaAnalise(
  analise: AnaliseIaDiagnosticoComercialPayload,
  janela: DiagnosticoComercialPayload["janela"] | undefined,
): Promise<void> {
  const res = await fetch("/api/v1/metrics/diagnostico-comercial/analise/pdf", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      analise.relatorio?.id
        ? { report_id: analise.relatorio.id }
        : {
            analise,
            janela: janela ? { from: janela.from, to: janela.to } : undefined,
          },
    ),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : "Não foi possível baixar o PDF.";
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivoPdf(janela);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-8 w-24" />
            <Skeleton className="mt-2 h-3 w-36" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AnaliseIaCard({
  analise,
  janela,
  loading,
  disabled,
  onGerar,
}: {
  analise: AnaliseIaDiagnosticoComercialPayload | null;
  janela: DiagnosticoComercialPayload["janela"] | undefined;
  loading: boolean;
  disabled: boolean;
  onGerar: () => void;
}) {
  const t = useT();
  const [promptAberto, setPromptAberto] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const prompt = analise?.prompt ?? null;

  const baixarPdf = async () => {
    if (!analise) return;
    setBaixandoPdf(true);
    try {
      await baixarPdfDaAnalise(analise, janela);
      toast.success(t("PDF gerado."));
    } catch {
      toast.error(t("Não foi possível baixar o PDF."));
    } finally {
      setBaixandoPdf(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              {t("Análise com IA")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Interpretação executiva gerada sob demanda a partir dos agregados desta tela.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {analise ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={baixarPdf}
                  disabled={baixandoPdf}
                >
                  {baixandoPdf ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="size-4" aria-hidden="true" />
                  )}
                  {t("Baixar PDF")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPromptAberto(true)}
                  disabled={!prompt}
                >
                  <Eye className="size-4" aria-hidden="true" />
                  {t("Ver prompt")}
                </Button>
              </>
            ) : null}
            <Button type="button" size="sm" onClick={onGerar} disabled={disabled || loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-4" aria-hidden="true" />
              )}
              {analise ? t("Refazer análise") : t("Gerar análise")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">{t("Sob demanda")}</Badge>
          <Badge variant="success">{t("Sem corpo das mensagens")}</Badge>
          {analise?.relatorio ? <Badge variant="neutral">{t("Salva no histórico")}</Badge> : null}
          {analise ? (
            <Badge variant="neutral">
              {t("Custo desta análise")}: {custoDaAnalise(analise.custo.cost_cents, t)}
            </Badge>
          ) : (
            <Badge variant="neutral">{t("Custo aparece depois do clique")}</Badge>
          )}
        </div>

        {analise ? (
          <>
            <div>
              <h3 className="text-sm font-semibold">{analise.titulo}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{analise.resumo}</p>
              <p className="mt-2 text-sm">
                <span className="font-medium">{t("Conclusão")}:</span>{" "}
                {analise.conclusao.justificativa}
              </p>
            </div>

            <div className="space-y-3">
              {analise.achados.map((achado, index) => (
                <div
                  key={`${achado.titulo}-${index}`}
                  className="border-t pt-3 first:border-t-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={variantePrioridade(achado.prioridade)}>
                      {rotuloPrioridade(achado.prioridade, t)}
                    </Badge>
                    <Badge variant="neutral">{achado.eixo}</Badge>
                    <p className="text-sm font-semibold">{achado.titulo}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Evidência")}: {achado.evidencia}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{achado.interpretacao}</p>
                  <p className="mt-1 text-sm">{achado.acao}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <h3 className="text-sm font-semibold">{t("Próximos passos da IA")}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {analise.proximos_passos.map((passo, index) => (
                    <li key={`${passo}-${index}`}>{passo}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("Limites")}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {analise.limites.map((limite, index) => (
                    <li key={`${limite}-${index}`}>{limite}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("Custo")}</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>
                    {t("Valor")}: {custoDaAnalise(analise.custo.cost_cents, t)}
                  </li>
                  <li>
                    {analise.custo.provider}/{analise.custo.model}
                  </li>
                  <li>
                    {t("Tokens")}: {inteiro(analise.custo.input_tokens)} in ·{" "}
                    {inteiro(analise.custo.output_tokens)} out
                  </li>
                  <li>
                    {t("Latência")}:{" "}
                    {(analise.custo.latency_ms / 1000).toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}
                    s
                  </li>
                </ul>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(
              "A leitura objetiva já está disponível. A IA só roda quando alguém pedir esta interpretação.",
            )}
          </p>
        )}
      </CardContent>
      <Dialog open={promptAberto} onOpenChange={setPromptAberto}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Prompt da análise")}</DialogTitle>
            <DialogDescription>
              {analise?.custo.provider}/{analise?.custo.model}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("Sistema")}</h3>
              <Textarea
                readOnly
                value={prompt?.system ?? ""}
                className="min-h-32 font-mono text-xs"
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("Usuário")}</h3>
              <Textarea
                readOnly
                value={prompt?.user ?? ""}
                className="min-h-80 font-mono text-xs"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function HistoricoAnalisesCard({
  relatorios,
  loading,
  error,
  selecionadoId,
  onAbrir,
}: {
  relatorios: RelatorioAnaliseIaDiagnosticoComercial[];
  loading: boolean;
  error: boolean;
  selecionadoId?: string;
  onAbrir: (relatorio: RelatorioAnaliseIaDiagnosticoComercial) => void;
}) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  const baixarPdf = async (relatorio: RelatorioAnaliseIaDiagnosticoComercial) => {
    setBaixandoId(relatorio.id);
    try {
      await baixarPdfDaAnalise(relatorio.analise, relatorio.janela);
      toast.success(t("PDF gerado."));
    } catch {
      toast.error(t("Não foi possível baixar o PDF."));
    } finally {
      setBaixandoId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-accent" aria-hidden="true" />
              {t("Histórico de análises")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Relatórios gerados ficam salvos para reabrir, auditar prompt e baixar PDF.")}
            </p>
          </div>
          <Badge variant="neutral">{t("Últimas 10")}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            {t("Não foi possível carregar o histórico de análises.")}
          </p>
        ) : relatorios.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nenhuma análise salva ainda.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Gerada em")}</TableHead>
                <TableHead>{t("Janela")}</TableHead>
                <TableHead>{t("Modelo")}</TableHead>
                <TableHead className="text-right">{t("Custo")}</TableHead>
                <TableHead className="w-44 text-right">{t("Ações")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relatorios.map((relatorio) => (
                <TableRow key={relatorio.id}>
                  <TableCell className="whitespace-nowrap">
                    {dataHora(relatorio.created_at, tagDoIdioma)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {janelaLegivel(relatorio.janela, tagDoIdioma)}
                  </TableCell>
                  <TableCell className="max-w-56 truncate">
                    {relatorio.analise.custo.provider}/{relatorio.analise.custo.model}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {custoDaAnalise(relatorio.analise.custo.cost_cents, t)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant={selecionadoId === relatorio.id ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => onAbrir(relatorio)}
                      >
                        <Eye className="size-4" aria-hidden="true" />
                        {t("Abrir")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => baixarPdf(relatorio)}
                        disabled={baixandoId === relatorio.id}
                      >
                        {baixandoId === relatorio.id ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Download className="size-4" aria-hidden="true" />
                        )}
                        {t("PDF")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function DiagnosticoComercialClient() {
  const t = useT();
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [analiseIa, setAnaliseIa] = useState<AnaliseIaDiagnosticoComercialPayload | null>(null);
  const [janelaDaAnalise, setJanelaDaAnalise] = useState<
    DiagnosticoComercialPayload["janela"] | undefined
  >(undefined);
  const query = useDiagnosticoComercial(periodo);
  const historicoQuery = useRelatoriosDiagnosticoComercial();
  const payload = query.data?.data;
  const analiseMutation = useMutation({
    mutationFn: async () => {
      if (!payload) throw new Error("Diagnóstico ainda não carregado.");
      return apiClient.post<{ data: AnaliseIaDiagnosticoComercialPayload }>(
        "/api/v1/metrics/diagnostico-comercial/analise",
        { from: payload.janela.from, to: payload.janela.to },
        { timeoutMs: 120_000 },
      );
    },
    onSuccess: (resposta) => {
      setAnaliseIa(resposta.data);
      setJanelaDaAnalise(payload?.janela);
      void queryClient.invalidateQueries({
        queryKey: ["metrics", "diagnostico-comercial", "analises"],
      });
      toast.success(t("Análise com IA gerada."));
    },
    onError: showApiError,
  });
  const selecionarPeriodo = (dias: Periodo) => {
    setPeriodo(dias);
    setAnaliseIa(null);
    setJanelaDaAnalise(undefined);
    analiseMutation.reset();
  };
  const abrirRelatorio = (relatorio: RelatorioAnaliseIaDiagnosticoComercial) => {
    setAnaliseIa(relatorio.analise);
    setJanelaDaAnalise(relatorio.janela);
    toast.success(t("Análise aberta do histórico."));
  };

  return (
    <div className="flex flex-col gap-6" data-testid="diagnostico-comercial-page">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("Período")}</span>
        {([7, 30, 90] as Periodo[]).map((dias) => (
          <Button
            key={dias}
            type="button"
            variant={periodo === dias ? "primary" : "secondary"}
            size="sm"
            onClick={() => selecionarPeriodo(dias)}
          >
            {dias} {t("dias")}
          </Button>
        ))}
      </div>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError || !payload ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-destructive">
              {t("Não foi possível carregar o diagnóstico comercial.")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("Leads criados")}
              value={inteiro(payload.aquisicao.leads_criados)}
              hint={`${percentual(payload.aquisicao.percentual_rastreado)} ${t("com origem rastreável")}`}
            />
            <StatCard
              label={t("Ganho sobre fechados")}
              value={percentual(payload.funil.taxa_ganho_fechados)}
              hint={`${inteiro(payload.funil.ganhos)} ${t("ganhos")} · ${inteiro(payload.funil.perdidos)} ${t("perdidos")}`}
            />
            <StatCard
              label={t("Primeira resposta humana")}
              value={duracao(payload.atendimento.mediana_primeira_resposta_humana_segundos)}
              hint={`${inteiro(payload.atendimento.conversas_sem_resposta_apos_entrada)} ${t("conversas sem resposta posterior")}`}
            />
            <StatCard
              label={t("Custo para abrir esta tela")}
              value={formatCentsUSD(payload.regua.custo_da_tela_cents)}
              hint={`${formatCentsUSD(payload.ia.custo_analise_cents)} ${t("em finalidades de análise no período")}`}
            />
          </section>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{t(payload.diagnostico.titulo)}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(payload.diagnostico.resumo)}
                  </p>
                </div>
                <Badge variant={payload.regua.leitura_sem_ia ? "success" : "neutral"}>
                  {payload.regua.leitura_sem_ia ? t("Sem IA ao abrir") : t("Com IA")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {payload.diagnostico.sinais.map((sinal) => (
                <div
                  key={`${sinal.eixo}-${sinal.titulo}`}
                  className="border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={varianteDoSinal(sinal.nivel)}>
                      {rotuloNivel(sinal.nivel, t)}
                    </Badge>
                    <p className="text-sm font-semibold">{t(sinal.titulo)}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t(sinal.descricao)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Evidência")}: {t(sinal.evidencia)}
                  </p>
                  <p className="mt-1 text-sm">{t(sinal.acao)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <AnaliseIaCard
            analise={analiseIa}
            janela={janelaDaAnalise ?? payload.janela}
            loading={analiseMutation.isPending}
            disabled={!payload}
            onGerar={() => analiseMutation.mutate()}
          />

          <HistoricoAnalisesCard
            relatorios={historicoQuery.data?.data.relatorios ?? []}
            loading={historicoQuery.isLoading}
            error={historicoQuery.isError}
            selecionadoId={analiseIa?.relatorio?.id}
            onAbrir={abrirRelatorio}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("Origem dos leads")}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t("Top origens dos leads criados no período.")}
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Origem")}</TableHead>
                      <TableHead>{t("Campanha")}</TableHead>
                      <TableHead className="text-right">{t("Leads")}</TableHead>
                      <TableHead className="text-right">{t("Rastreados")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.aquisicao.origens.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          {t("Nenhum lead criado no período.")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      payload.aquisicao.origens.map((origem) => (
                        <TableRow key={`${origem.chave}-${origem.campanha ?? ""}`}>
                          <TableCell>{origem.chave}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {origem.campanha ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {inteiro(origem.quantidade)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {inteiro(origem.rastreado)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("Atendimento")}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t("Mensagens e autoria das respostas registradas no período.")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t("Entradas")}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {inteiro(payload.atendimento.mensagens_entrada)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("Saídas")}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {inteiro(payload.atendimento.mensagens_saida)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("Handoffs")}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {inteiro(payload.atendimento.handoffs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("Aguardando")}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {inteiro(payload.atendimento.aguardando_resposta)}
                    </p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Autoria")}</TableHead>
                      <TableHead className="text-right">{t("Saídas")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.atendimento.saidas_por_autoria.map((linha) => (
                      <TableRow key={linha.chave}>
                        <TableCell>{linha.chave}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inteiro(linha.quantidade)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("Perdas e atividades")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">{t("Motivos de perda")}</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {payload.funil.perdidos_por_motivo.length === 0 ? (
                      <li className="text-muted-foreground">{t("Nenhuma perda fechada.")}</li>
                    ) : (
                      payload.funil.perdidos_por_motivo.map((linha) => (
                        <li key={linha.chave} className="flex justify-between gap-3">
                          <span className="truncate">{linha.chave}</span>
                          <span className="tabular-nums">{inteiro(linha.quantidade)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{t("Atividades por ator")}</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {payload.atividades.por_ator.length === 0 ? (
                      <li className="text-muted-foreground">
                        {t("Nenhuma atividade registrada.")}
                      </li>
                    ) : (
                      payload.atividades.por_ator.map((linha) => (
                        <li key={linha.chave} className="flex justify-between gap-3">
                          <span>{linha.chave}</span>
                          <span className="tabular-nums">{inteiro(linha.quantidade)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("IA e custo")}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t("Custo registrado em llm_calls; a tela em si não chama modelo.")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t("Chamadas")}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {inteiro(payload.ia.chamadas)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("Erros")}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {inteiro(payload.ia.erros)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("p50")}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {payload.ia.latencia_p50_ms === null
                        ? "—"
                        : `${(payload.ia.latencia_p50_ms / 1000).toLocaleString("pt-BR", {
                            maximumFractionDigits: 1,
                          })}s`}
                    </p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Finalidade")}</TableHead>
                      <TableHead className="text-right">{t("Chamadas")}</TableHead>
                      <TableHead className="text-right">{t("Custo")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.ia.por_finalidade.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-muted-foreground">
                          {t("Nenhuma chamada de IA no período.")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      payload.ia.por_finalidade.map((linha) => (
                        <TableRow key={linha.chave}>
                          <TableCell>{linha.chave}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {inteiro(linha.quantidade)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCentsUSD(linha.custo_cents)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Régua e próximos passos")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <h3 className="text-sm font-semibold">{t("Próximos passos")}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {payload.diagnostico.proximos_passos.map((passo) => (
                    <li key={passo}>{t(passo)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("Não medido")}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {payload.diagnostico.nao_medido.map((item) => (
                    <li key={item}>{t(item)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t("Definição")}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {payload.regua.observacoes.map((item) => (
                    <li key={item}>{t(item)}</li>
                  ))}
                  {payload.regua.truncado ? (
                    <li>{t("A leitura bateu no teto de linhas da rota.")}</li>
                  ) : null}
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

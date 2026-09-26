"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Play,
  QrCode,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

const ANALYSIS_PURPOSE = "whatsapp_history_analysis";
const INSTALLATION_CREDENTIAL_VALUE = "__installation__";

interface ImportRow {
  id: string;
  status: string;
  full_sync: boolean;
  max_chats: number;
  max_messages_per_chat: number;
  counters: {
    chats_total: number;
    chats_imported: number;
    messages_seen: number;
    messages_imported: number;
    media_skipped: number;
    groups_skipped: number;
  };
  error: { code: string; message: string | null } | null;
  retention_until: string;
  created_at: string;
  updated_at: string;
  connected_at: string | null;
  finished_at: string | null;
  report: ReportRow | null;
}

interface ImportsPayload {
  imports: ImportRow[];
}

interface AnalysisSettingsPayload {
  prompt: string;
  default_prompt: string;
  customized: boolean;
  can_edit: boolean;
}

interface AiProviderOption {
  id: string;
  rotulo: string;
}

interface AiCredentialOption {
  id: string;
  provider: string;
  label: string;
  api_key_last4: string | null;
}

interface AiModelOption {
  provider: string;
  model_id: string;
  display_name: string;
}

interface AiPointOption {
  id: string;
  rotulo: string;
  efetivo: {
    provider: string;
    modelId: string | null;
    credentialId: string | null;
    origem: string;
  };
  avisos: string[];
}

interface AiProvidersPayload {
  pontos: AiPointOption[];
  provedores: AiProviderOption[];
  credenciais: AiCredentialOption[];
  modelos: AiModelOption[];
  podeEditar: boolean;
}

interface ReportFinding {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  metric: string;
  next_step: string;
}

interface ReportRow {
  id: string;
  report_version: string;
  summary: string;
  metrics: Record<string, unknown>;
  findings: ReportFinding[];
  limitations: string[];
  generated_at: string;
  created_at: string;
  updated_at: string;
}

interface ReportFaq {
  question: string;
  evidence: string;
  suggested_answer?: string;
}

function statusLabel(status: string, t: (value: string) => string): string {
  const labels: Record<string, string> = {
    qr_pending: t("Aguardando QR"),
    importing: t("Importando"),
    ready: t("Pronto"),
    failed: t("Falhou"),
    cancelled: t("Cancelado"),
    deleted: t("Apagado"),
    expired: t("Expirado"),
  };
  return labels[status] ?? status;
}

function statusIcon(status: string) {
  if (status === "ready") return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />;
  if (status === "failed") return <AlertTriangle className="text-danger h-4 w-4" aria-hidden />;
  if (status === "qr_pending") return <QrCode className="h-4 w-4 text-accent" aria-hidden />;
  return <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden />;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { hour12: false });
  } catch {
    return iso;
  }
}

function metricNumber(report: ReportRow, key: string): number | null {
  const value = report.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fmtMinutes(value: number | null): string {
  if (value === null) return "—";
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function severityClass(severity: ReportFinding["severity"]): string {
  if (severity === "high") return "border-danger/40 bg-danger-bg text-danger";
  if (severity === "medium") return "border-warning/40 bg-warning-bg text-warning-fg";
  return "border-border bg-surface-muted text-muted-foreground";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function faqArray(value: unknown): ReportFaq[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ({
      question: typeof item.question === "string" ? item.question : "",
      evidence: typeof item.evidence === "string" ? item.evidence : "",
      suggested_answer:
        typeof item.suggested_answer === "string" ? item.suggested_answer : undefined,
    }))
    .filter((item) => item.question.trim().length > 0);
}

export function WhatsappHistoryClient({
  canStart,
  transportConfigured,
}: {
  canStart: boolean;
  transportConfigured: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [fullSync, setFullSync] = useState(false);
  const [fullSyncAck, setFullSyncAck] = useState(false);
  const [maxChats, setMaxChats] = useState(200);
  const [maxMessages, setMaxMessages] = useState(500);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [aiConsentById, setAiConsentById] = useState<Record<string, boolean>>({});
  const [analysisPromptDraft, setAnalysisPromptDraft] = useState<string | null>(null);
  const [analysisProviderDraft, setAnalysisProviderDraft] = useState<string | null>(null);
  const [analysisModelIdDraft, setAnalysisModelIdDraft] = useState<string | null>(null);
  const [analysisCredentialDraft, setAnalysisCredentialDraft] = useState<string | null>(null);

  const imports = useQuery({
    queryKey: ["whatsapp-history", "imports"],
    queryFn: async () =>
      (await apiClient.get<{ data: ImportsPayload }>("/api/v1/whatsapp-history/imports")).data
        .imports,
    refetchInterval: 5000,
  });

  const analysisSettings = useQuery({
    queryKey: ["whatsapp-history", "analysis-settings"],
    queryFn: async () =>
      (
        await apiClient.get<{ data: AnalysisSettingsPayload }>(
          "/api/v1/whatsapp-history/analysis-settings",
        )
      ).data,
  });

  const aiProviders = useQuery({
    queryKey: ["ai-providers", ANALYSIS_PURPOSE],
    queryFn: async () =>
      (await apiClient.get<{ data: AiProvidersPayload }>("/api/v1/ai/providers")).data,
  });

  const rows = useMemo(() => imports.data ?? [], [imports.data]);
  const active = useMemo(
    () => rows.find((row) => row.status === "qr_pending" || row.status === "importing") ?? null,
    [rows],
  );
  const analysisPoint = useMemo(
    () => aiProviders.data?.pontos.find((ponto) => ponto.id === ANALYSIS_PURPOSE) ?? null,
    [aiProviders.data],
  );
  const analysisPrompt = analysisPromptDraft ?? analysisSettings.data?.prompt ?? "";
  const analysisProvider = analysisProviderDraft ?? analysisPoint?.efetivo.provider ?? "";
  const analysisModelId = analysisModelIdDraft ?? analysisPoint?.efetivo.modelId ?? "";
  const analysisCredential =
    analysisCredentialDraft ?? analysisPoint?.efetivo.credentialId ?? INSTALLATION_CREDENTIAL_VALUE;
  const providerOptions = aiProviders.data?.provedores ?? [];
  const credentialOptions = useMemo(
    () =>
      (aiProviders.data?.credenciais ?? []).filter(
        (credential) => credential.provider === analysisProvider,
      ),
    [aiProviders.data, analysisProvider],
  );
  const modelOptions = useMemo(() => {
    const modelos = (aiProviders.data?.modelos ?? []).filter(
      (model) => model.provider === analysisProvider,
    );
    if (
      analysisModelId &&
      analysisProvider &&
      !modelos.some((model) => model.model_id === analysisModelId)
    ) {
      return [
        {
          provider: analysisProvider,
          model_id: analysisModelId,
          display_name: analysisModelId,
        },
        ...modelos,
      ];
    }
    return modelos;
  }, [aiProviders.data, analysisModelId, analysisProvider]);
  const canEditAnalysis =
    Boolean(analysisSettings.data?.can_edit) && Boolean(aiProviders.data?.podeEditar);
  const canSaveAnalysis =
    canEditAnalysis &&
    analysisPrompt.trim().length >= 50 &&
    analysisProvider.trim().length > 0 &&
    analysisModelId.trim().length > 0;

  const reload = () => {
    void qc.invalidateQueries({ queryKey: ["whatsapp-history", "imports"] });
  };

  const criar = useMutation({
    mutationFn: () =>
      apiClient.post("/api/v1/whatsapp-history/imports", {
        consent,
        full_sync: fullSync,
        full_sync_acknowledged: fullSyncAck,
        max_chats: maxChats,
        max_messages_per_chat: maxMessages,
      }),
    onSuccess: () => {
      setConsent(false);
      reload();
    },
    onError: showApiError,
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/v1/whatsapp-history/imports/${id}/cancel`, {}),
    onSuccess: reload,
    onError: showApiError,
  });

  const apagar = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/whatsapp-history/imports/${id}`),
    onSuccess: reload,
    onError: showApiError,
  });

  const gerarRelatorio = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/v1/whatsapp-history/imports/${id}/report`, {}),
    onMutate: (id) => {
      setReportingId(id);
    },
    onSuccess: reload,
    onError: showApiError,
    onSettled: () => {
      setReportingId(null);
    },
  });

  const gerarAnaliseIa = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/api/v1/whatsapp-history/imports/${id}/report`, {
        mode: "ai",
        ai_consent: true,
      }),
    onMutate: (id) => {
      setReportingId(id);
    },
    onSuccess: reload,
    onError: showApiError,
    onSettled: () => {
      setReportingId(null);
    },
  });

  const salvarAnalise = useMutation({
    mutationFn: async () => {
      await apiClient.patch("/api/v1/whatsapp-history/analysis-settings", {
        prompt: analysisPrompt,
      });
      await apiClient.put("/api/v1/ai/providers", {
        purpose: ANALYSIS_PURPOSE,
        provider: analysisProvider,
        model_id: analysisModelId,
        credential_id:
          analysisCredential === INSTALLATION_CREDENTIAL_VALUE ? null : analysisCredential,
        is_enabled: true,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["whatsapp-history", "analysis-settings"] });
      void qc.invalidateQueries({ queryKey: ["ai-providers", ANALYSIS_PURPOSE] });
    },
    onError: showApiError,
  });

  const { mutate: sincronizarConexao, isPending: sincronizandoConexao } = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/v1/whatsapp-history/imports/${id}/sync`, {}),
    onSuccess: reload,
    onError: () => undefined,
  });

  const activeQrId = active?.status === "qr_pending" ? active.id : null;

  useEffect(() => {
    if (!activeQrId || !canStart || !transportConfigured) return;

    const executar = () => {
      if (!sincronizandoConexao) sincronizarConexao(activeQrId);
    };
    executar();
    const timer = window.setInterval(executar, 3000);
    return () => window.clearInterval(timer);
  }, [activeQrId, canStart, transportConfigured, sincronizandoConexao, sincronizarConexao]);

  const podeCriar = canStart && transportConfigured && consent && (!fullSync || fullSyncAck);
  const selecionarProvedor = (provider: string) => {
    setAnalysisProviderDraft(provider);
    const firstModel =
      aiProviders.data?.modelos.find((model) => model.provider === provider)?.model_id ?? "";
    const firstCredential =
      aiProviders.data?.credenciais.find((credential) => credential.provider === provider)?.id ??
      INSTALLATION_CREDENTIAL_VALUE;
    setAnalysisModelIdDraft(firstModel);
    setAnalysisCredentialDraft(firstCredential);
  };
  const restaurarPromptDefault = () => {
    if (analysisSettings.data) setAnalysisPromptDraft(analysisSettings.data.default_prompt);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold">{t("Nova importação")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("A conexão temporária não usa o número já ligado ao atendimento.")}
            </p>
          </div>

          {!transportConfigured ? (
            <div className="flex gap-2 rounded-sm border border-warning/40 bg-warning-bg p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" aria-hidden />
              <p className="text-warning-fg">
                {t("Transporte de histórico não está configurado nesta instalação.")}
              </p>
            </div>
          ) : null}

          {!canStart ? (
            <div className="bg-surface-muted rounded-sm border border-border p-3 text-sm text-muted-foreground">
              {t("Somente administradores iniciam uma importação de histórico.")}
            </div>
          ) : null}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1 h-4 w-4 rounded-sm border-border"
            />
            <span>
              {t(
                "Confirmo autorização para conectar uma sessão temporária e importar mensagens para análise.",
              )}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("Chats")}
              <Input
                type="number"
                min={1}
                max={5000}
                value={maxChats}
                onChange={(event) => setMaxChats(Number(event.target.value))}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              {t("Mensagens por chat")}
              <Input
                type="number"
                min={1}
                max={5000}
                value={maxMessages}
                onChange={(event) => setMaxMessages(Number(event.target.value))}
              />
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={fullSync}
              onChange={(event) => {
                setFullSync(event.target.checked);
                if (!event.target.checked) setFullSyncAck(false);
              }}
              className="mt-1 h-4 w-4 rounded-sm border-border"
            />
            <span>{t("Usar full sync")}</span>
          </label>

          {fullSync ? (
            <label className="flex items-start gap-2 rounded-sm border border-warning/40 bg-warning-bg p-3 text-sm">
              <input
                type="checkbox"
                checked={fullSyncAck}
                onChange={(event) => setFullSyncAck(event.target.checked)}
                className="mt-1 h-4 w-4 rounded-sm border-border"
              />
              <span className="text-warning-fg">
                {t("Entendo que full sync pode demorar mais e aumentar consumo de CPU e disco.")}
              </span>
            </label>
          ) : null}

          <Button
            type="button"
            disabled={!podeCriar || criar.isPending || Boolean(active)}
            onClick={() => criar.mutate()}
          >
            <Play className="h-4 w-4" aria-hidden />
            {criar.isPending ? t("Criando…") : t("Iniciar")}
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        {active?.status === "qr_pending" ? (
          <Card className="p-4">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="flex aspect-square items-center justify-center rounded-sm border border-border bg-white p-3">
                <Image
                  src={`/api/v1/whatsapp-history/imports/${active.id}/qr?ts=${encodeURIComponent(active.updated_at)}`}
                  alt={t("QR code")}
                  width={220}
                  height={220}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex flex-col justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">{t("Conectar sessão temporária")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(
                      "Depois da leitura do QR, vamos confirmar a conexão automaticamente e iniciar a importação.",
                    )}
                  </p>
                  {sincronizandoConexao ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("Verificando se o QR já foi lido…")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={reload} disabled={imports.isFetching}>
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    {t("Atualizar")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => cancelar.mutate(active.id)}
                    disabled={cancelar.isPending}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    {t("Cancelar")}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{t("Análise com IA")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Prompt, provedor e chave usados no diagnóstico do histórico importado.")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={restaurarPromptDefault}
                disabled={!canEditAnalysis || analysisSettings.isLoading}
              >
                {t("Restaurar prompt")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => salvarAnalise.mutate()}
                disabled={!canSaveAnalysis || salvarAnalise.isPending}
              >
                <Save className="h-4 w-4" aria-hidden />
                {salvarAnalise.isPending ? t("Salvando…") : t("Salvar análise")}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{t("Provedor")}</Label>
              <Select
                value={analysisProvider}
                onValueChange={selecionarProvedor}
                disabled={!canEditAnalysis || aiProviders.isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Selecionar provedor")} />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("Modelo")}</Label>
              <Select
                value={analysisModelId}
                onValueChange={setAnalysisModelIdDraft}
                disabled={!canEditAnalysis || modelOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Selecionar modelo")} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((model) => (
                    <SelectItem key={`${model.provider}:${model.model_id}`} value={model.model_id}>
                      {model.display_name || model.model_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("Chave")}</Label>
              <Select
                value={analysisCredential}
                onValueChange={setAnalysisCredentialDraft}
                disabled={!canEditAnalysis}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Selecionar chave")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INSTALLATION_CREDENTIAL_VALUE}>
                    {t("Chave da instalação")}
                  </SelectItem>
                  {credentialOptions.map((credential) => (
                    <SelectItem key={credential.id} value={credential.id}>
                      {credential.label}
                      {credential.api_key_last4 ? ` · ****${credential.api_key_last4}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {analysisPoint?.avisos.length ? (
            <div className="mt-3 rounded-sm border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg">
              {analysisPoint.avisos[0]}
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            <Label htmlFor="whatsapp-history-analysis-prompt">{t("Prompt default")}</Label>
            <Textarea
              id="whatsapp-history-analysis-prompt"
              rows={10}
              value={analysisPrompt}
              onChange={(event) => setAnalysisPromptDraft(event.target.value)}
              disabled={!canEditAnalysis || analysisSettings.isLoading}
            />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="text-base font-semibold">{t("Importações")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("Conteúdo importado fica temporário e pode ser apagado a qualquer momento.")}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={reload} disabled={imports.isFetching}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t("Atualizar")}
            </Button>
          </div>

          {imports.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">{t("Carregando…")}</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {t("Nenhuma importação criada.")}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((row) => {
                const total = Math.max(row.counters.chats_total, 1);
                const pct = Math.min(100, Math.round((row.counters.chats_imported / total) * 100));
                const aiConsent = aiConsentById[row.id] === true;
                const aiBusy = gerarAnaliseIa.isPending && reportingId === row.id;
                return (
                  <article key={row.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {statusIcon(row.status)}
                          <span>{statusLabel(row.status, t)}</span>
                          {row.full_sync ? (
                            <span className="rounded-sm border border-warning/40 px-2 py-0.5 text-xs text-warning-fg">
                              full sync
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fmtDate(row.created_at)} · {t("retenção até")}{" "}
                          {fmtDate(row.retention_until)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {row.status === "ready" ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => gerarRelatorio.mutate(row.id)}
                              disabled={gerarRelatorio.isPending && reportingId === row.id}
                            >
                              <BarChart3 className="h-4 w-4" aria-hidden />
                              {row.report ? t("Atualizar regras") : t("Relatório por regras")}
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                              <a
                                href={`/api/v1/whatsapp-history/imports/${row.id}/export?dataset=messages&format=xlsx`}
                              >
                                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                                {t("XLSX mensagens")}
                              </a>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                              <a
                                href={`/api/v1/whatsapp-history/imports/${row.id}/export?dataset=chats&format=xlsx`}
                              >
                                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                                {t("XLSX chats")}
                              </a>
                            </Button>
                            {row.report ? (
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={`/api/v1/whatsapp-history/imports/${row.id}/report?format=md`}
                                >
                                  <Download className="h-4 w-4" aria-hidden />
                                  {t("Relatório")}
                                </a>
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {row.status === "qr_pending" || row.status === "importing" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cancelar.mutate(row.id)}
                            disabled={cancelar.isPending}
                          >
                            <X className="h-4 w-4" aria-hidden />
                            {t("Cancelar")}
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => apagar.mutate(row.id)}
                          disabled={apagar.isPending}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          {t("Apagar")}
                        </Button>
                      </div>
                    </div>

                    <div className="bg-surface-muted mt-3 h-2 overflow-hidden rounded-sm">
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                      <Stat
                        label={t("Chats")}
                        value={`${row.counters.chats_imported}/${row.counters.chats_total}`}
                      />
                      <Stat label={t("Mensagens")} value={String(row.counters.messages_imported)} />
                      <Stat label={t("Vistas")} value={String(row.counters.messages_seen)} />
                      <Stat
                        label={t("Mídias puladas")}
                        value={String(row.counters.media_skipped)}
                      />
                      <Stat
                        label={t("Chats pulados")}
                        value={String(row.counters.groups_skipped)}
                      />
                    </dl>

                    {row.status === "ready" ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border p-3">
                        <label className="flex min-w-[240px] flex-1 items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={aiConsent}
                            onChange={(event) =>
                              setAiConsentById((current) => ({
                                ...current,
                                [row.id]: event.target.checked,
                              }))
                            }
                            className="mt-1 h-4 w-4 rounded-sm border-border"
                          />
                          <span>
                            {t(
                              "Autorizo usar IA externa para analisar uma amostra sanitizada desta importação.",
                            )}
                          </span>
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => gerarAnaliseIa.mutate(row.id)}
                          disabled={!aiConsent || aiBusy}
                        >
                          <Sparkles className="h-4 w-4" aria-hidden />
                          {aiBusy ? t("Analisando…") : t("Analisar com IA")}
                        </Button>
                      </div>
                    ) : null}

                    {row.error ? (
                      <p className="border-danger/40 bg-danger-bg text-danger mt-3 rounded-sm border p-2 text-sm">
                        {row.error.message ?? row.error.code}
                      </p>
                    ) : null}

                    {row.report ? <ReportPanel importId={row.id} report={row.report} /> : null}
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ReportPanel({ importId, report }: { importId: string; report: ReportRow }) {
  const t = useT();
  const aiUsed = report.metrics.ai_used === true;
  const faqs = faqArray(report.metrics.ai_faqs);
  const improvements = stringArray(report.metrics.ai_improvements);
  return (
    <section className="mt-4 rounded-sm border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {aiUsed ? <Sparkles className="h-4 w-4 text-accent" aria-hidden /> : null}
            {aiUsed ? t("Relatório com IA") : t("Relatório por regras")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{report.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {aiUsed
              ? t("Amostra textual sanitizada, métricas automáticas e diagnóstico de IA.")
              : t(
                  "Análise por regras e métricas; não usa IA nem interpreta o texto das mensagens.",
                )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{fmtDate(report.generated_at)}</p>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/v1/whatsapp-history/imports/${importId}/report?format=md`}>
              <FileText className="h-4 w-4" aria-hidden />
              {t("Baixar")}
            </a>
          </Button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
        <Stat
          label={t("Sem resposta")}
          value={String(metricNumber(report, "unanswered_chats") ?? 0)}
        />
        <Stat
          label={t("Sem saída")}
          value={String(metricNumber(report, "chats_without_outbound") ?? 0)}
        />
        <Stat
          label={t("1ª resposta")}
          value={fmtMinutes(metricNumber(report, "median_first_response_minutes"))}
        />
        <Stat
          label={t("Fora do horário")}
          value={`${metricNumber(report, "inbound_outside_business_hours_percent") ?? 0}%`}
        />
        {aiUsed ? (
          <>
            <Stat
              label={t("Msgs IA")}
              value={String(metricNumber(report, "ai_messages_sampled") ?? 0)}
            />
            <Stat
              label={t("Chats IA")}
              value={String(metricNumber(report, "ai_chats_sampled") ?? 0)}
            />
          </>
        ) : null}
      </dl>

      {report.findings.length > 0 ? (
        <div className="mt-3 space-y-2">
          {report.findings.map((finding) => (
            <div
              key={`${finding.metric}:${finding.title}`}
              className={`rounded-sm border p-2 text-sm ${severityClass(finding.severity)}`}
            >
              <p className="font-medium">{finding.title}</p>
              <p className="mt-1">{finding.detail}</p>
              <p className="mt-1 text-xs">{finding.next_step}</p>
            </div>
          ))}
        </div>
      ) : null}

      {faqs.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-sm font-semibold">{t("FAQs e dúvidas recorrentes")}</h4>
          <div className="mt-2 space-y-2">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-sm border border-border p-2 text-sm">
                <p className="font-medium">{faq.question}</p>
                <p className="mt-1 text-muted-foreground">{faq.evidence}</p>
                {faq.suggested_answer ? (
                  <p className="mt-1 text-xs text-muted-foreground">{faq.suggested_answer}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {improvements.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-sm font-semibold">{t("Melhorias recomendadas")}</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {improvements.map((improvement) => (
              <li key={improvement}>{improvement}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.limitations.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {report.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

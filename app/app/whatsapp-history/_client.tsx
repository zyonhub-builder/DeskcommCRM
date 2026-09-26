"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Play,
  QrCode,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

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
}

interface ImportsPayload {
  imports: ImportRow[];
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

  const imports = useQuery({
    queryKey: ["whatsapp-history", "imports"],
    queryFn: async () =>
      (await apiClient.get<{ data: ImportsPayload }>("/api/v1/whatsapp-history/imports")).data
        .imports,
    refetchInterval: 5000,
  });

  const rows = useMemo(() => imports.data ?? [], [imports.data]);
  const active = useMemo(
    () => rows.find((row) => row.status === "qr_pending" || row.status === "importing") ?? null,
    [rows],
  );

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

  const {
    mutate: sincronizarConexao,
    isPending: sincronizandoConexao,
  } = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/api/v1/whatsapp-history/imports/${id}/sync`, {}),
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

                    {row.error ? (
                      <p className="border-danger/40 bg-danger-bg text-danger mt-3 rounded-sm border p-2 text-sm">
                        {row.error.message ?? row.error.code}
                      </p>
                    ) : null}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

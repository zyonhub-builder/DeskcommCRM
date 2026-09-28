"use client";

import { useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdminInstances,
  useSaveAdminInstanceSettings,
  useSendAdminInstanceTestAlert,
  type AdminInstanceSettingsPatch,
} from "@/hooks/useAdminInstances";
import { useT } from "@/hooks/i18n/useT";
import { Bell, CheckCircle, Clock, PaperPlaneTilt, WifiHigh, WifiSlash } from "@/lib/ui/icons";

export function InstanciasAdminClient() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useAdminInstances();
  const salvar = useSaveAdminInstanceSettings();
  const teste = useSendAdminInstanceTestAlert();
  const [draft, setDraft] = useState<AdminInstanceSettingsPatch | null>(null);

  const baseForm = useMemo<AdminInstanceSettingsPatch | null>(() => {
    if (!data) return null;
    return {
      enabled: data.settings.enabled,
      channel_organization_id: data.settings.channel_organization_id,
      channel_session_id: data.settings.channel_session_id,
      recipient_kind: data.settings.recipient_kind,
      recipient: data.settings.recipient,
      recipient_label: data.settings.recipient_label,
      notify_on_down: data.settings.notify_on_down,
      notify_on_recovered: data.settings.notify_on_recovered,
    };
  }, [data]);

  const form = draft ?? baseForm;
  const updateForm = (patch: Partial<AdminInstanceSettingsPatch>) => {
    if (!baseForm) return;
    setDraft((prev) => ({ ...(prev ?? baseForm), ...patch }));
  };

  const selectedChannelValue = useMemo(() => {
    if (!form?.channel_session_id) return undefined;
    return form.channel_session_id;
  }, [form?.channel_session_id]);

  if (isError) {
    return (
      <div className="space-y-4">
        <Cabecalho />
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              {t("Não foi possível carregar as instâncias agora.")}
            </p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              {t("Tentar de novo")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !data || !form) return <InstanciasSkeleton />;

  const selectedChannel = data.channel_options.find((c) => c.id === form.channel_session_id);
  const canSave =
    !form.enabled ||
    (Boolean(form.channel_organization_id) &&
      Boolean(form.channel_session_id) &&
      Boolean(form.recipient?.trim()));

  return (
    <div className="space-y-6">
      <Cabecalho />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <ResumoCard
          label={t("Funcionando")}
          value={data.summary.working_sessions}
          icon={<WifiHigh className="h-5 w-5 text-emerald-600" />}
        />
        <ResumoCard
          label={t("Fora do ar")}
          value={data.summary.down_sessions}
          icon={<WifiSlash className="h-5 w-5 text-red-600" />}
          danger={data.summary.down_sessions > 0}
        />
        <ResumoCard
          label={t("Atenção")}
          value={data.summary.warning_sessions}
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          accent={data.summary.warning_sessions > 0}
        />
        <ResumoCard
          label={t("Pendentes >10min")}
          value={data.summary.pending_conversations_10min}
          icon={<Bell className="h-5 w-5 text-muted-foreground" />}
          accent={data.summary.pending_conversations_10min > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Avisos no WhatsApp")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <Label htmlFor="alertas-enabled">{t("Enviar avisos")}</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {form.enabled ? t("Ativo") : t("Desativado")}
                </p>
              </div>
              <Switch
                id="alertas-enabled"
                checked={form.enabled}
                onCheckedChange={(enabled) => updateForm({ enabled })}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("Conexão que envia")}</Label>
                <Select
                  value={selectedChannelValue}
                  onValueChange={(channelId) => {
                    const channel = data.channel_options.find((c) => c.id === channelId);
                    updateForm({
                      channel_session_id: channel?.id ?? null,
                      channel_organization_id: channel?.organization_id ?? null,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("Selecionar conexão")} />
                  </SelectTrigger>
                  <SelectContent>
                    {data.channel_options.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {channel.organization_name} · {channel.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedChannel && !selectedChannel.accepts_freeform ? (
                  <p className="text-xs text-amber-600">
                    {t("Esta conexão não envia texto livre fora da janela.")}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>{t("Tipo de destino")}</Label>
                <Select
                  value={form.recipient_kind}
                  onValueChange={(recipient_kind) =>
                    updateForm({ recipient_kind: recipient_kind as "phone" | "group" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">{t("Telefone")}</SelectItem>
                    <SelectItem value="group">{t("Grupo")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="alertas-recipient">{t("Destino dos avisos")}</Label>
                <Input
                  id="alertas-recipient"
                  value={form.recipient ?? ""}
                  onChange={(e) => updateForm({ recipient: e.target.value })}
                  placeholder={
                    form.recipient_kind === "phone" ? "+5511999999999" : "120363000000000000@g.us"
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="alertas-label">{t("Rótulo interno")}</Label>
                <Input
                  id="alertas-label"
                  value={form.recipient_label ?? ""}
                  onChange={(e) => updateForm({ recipient_label: e.target.value })}
                  placeholder={t("Plantão operação")}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span>{t("Avisar quando cair")}</span>
                <Switch
                  checked={form.notify_on_down}
                  onCheckedChange={(notify_on_down) =>
                    updateForm({ notify_on_down })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span>{t("Avisar quando voltar")}</span>
                <Switch
                  checked={form.notify_on_recovered}
                  onCheckedChange={(notify_on_recovered) =>
                    updateForm({ notify_on_recovered })
                  }
                />
              </label>
            </div>
          </div>

          <div className="space-y-4 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t("Status da configuração")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {form.enabled
                    ? t("Avisos automáticos ligados")
                    : t("Avisos automáticos desligados")}
                </p>
              </div>
              <Badge variant={form.enabled ? "default" : "secondary"}>
                {form.enabled ? t("Ativo") : t("Desligado")}
              </Badge>
            </div>
            <div className="space-y-2 text-sm">
              <LinhaResumo label={t("Remetente")} value={selectedChannel?.label ?? "—"} />
              <LinhaResumo
                label={t("Empresa remetente")}
                value={selectedChannel?.organization_name ?? "—"}
              />
              <LinhaResumo label={t("Destino salvo")} value={data.settings.recipient_mask ?? "—"} />
              <LinhaResumo
                label={t("Atualizado")}
                value={formatDate(data.settings.updated_at) ?? "—"}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={() => salvar.mutate(form, { onSuccess: () => setDraft(null) })}
                disabled={!canSave || salvar.isPending}
                className="gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                {salvar.isPending ? t("Salvando") : t("Salvar configuração")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => teste.mutate()}
                disabled={teste.isPending || !data.settings.enabled}
                className="gap-2"
              >
                <PaperPlaneTilt className="h-4 w-4" />
                {teste.isPending ? t("Enviando") : t("Enviar teste")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Instâncias conectadas")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Empresa")}</TableHead>
                <TableHead>{t("Conexão")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead>{t("Pendentes")}</TableHead>
                <TableHead>{t("Última checagem")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">{session.organization_name}</TableCell>
                  <TableCell>
                    <div className="max-w-[260px]">
                      <p className="truncate">{session.display_name || session.phone_number || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {session.phone_number ?? session.id}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={badgeVariant(session.health)}>
                      {session.status ?? t("Desconhecido")}
                    </Badge>
                    {session.status_reason ? (
                      <p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground">
                        {session.status_reason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {session.pending_conversations_10min}
                  </TableCell>
                  <TableCell>{formatDate(session.last_health_check_at) ?? "—"}</TableCell>
                </TableRow>
              ))}
              {data.sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {t("Nenhuma conexão ativa encontrada.")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Últimos avisos")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Quando")}</TableHead>
                <TableHead>{t("Evento")}</TableHead>
                <TableHead>{t("Empresa")}</TableHead>
                <TableHead>{t("Entrega")}</TableHead>
                <TableHead>{t("Destino")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell>{formatDate(delivery.created_at) ?? "—"}</TableCell>
                  <TableCell>{labelEvento(delivery.event_kind, t)}</TableCell>
                  <TableCell>{delivery.affected_organization_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={delivery.status === "sent" ? "default" : "outline"}>
                      {labelStatusEntrega(delivery.status, t)}
                    </Badge>
                    {delivery.reason ? (
                      <p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground">
                        {delivery.reason_label}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>{delivery.recipient_mask ?? "—"}</TableCell>
                </TableRow>
              ))}
              {data.deliveries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {t("Nenhum aviso enviado ainda.")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Cabecalho() {
  const t = useT();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("Instâncias")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Saúde global das conexões e avisos operacionais.")}
      </p>
    </div>
  );
}

function ResumoCard({
  label,
  value,
  icon,
  accent,
  danger,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-5">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p
            className={
              danger
                ? "mt-1 text-3xl font-semibold tabular-nums text-red-600"
                : accent
                  ? "mt-1 text-3xl font-semibold tabular-nums text-amber-600"
                  : "mt-1 text-3xl font-semibold tabular-nums"
            }
          >
            {value}
          </p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

function LinhaResumo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[220px] truncate text-right font-medium">{value}</span>
    </div>
  );
}

function InstanciasSkeleton() {
  return (
    <div className="space-y-6">
      <Cabecalho />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 py-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function badgeVariant(health: "ok" | "warning" | "critical") {
  if (health === "critical") return "destructive";
  if (health === "warning") return "outline";
  return "secondary";
}

function labelEvento(event: string, t: (s: string) => string) {
  if (event === "down") return t("Caiu");
  if (event === "recovered") return t("Voltou");
  if (event === "test") return t("Teste");
  return event;
}

function labelStatusEntrega(status: string, t: (s: string) => string) {
  if (status === "sent") return t("Enviado");
  if (status === "skipped") return t("Pulado");
  if (status === "failed") return t("Falhou");
  return status;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

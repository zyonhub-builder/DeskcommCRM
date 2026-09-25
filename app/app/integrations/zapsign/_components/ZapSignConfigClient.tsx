"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/types";
import { copyToClipboard } from "@/lib/clipboard";
import type { ZapsignIntegrationPublica } from "@/lib/zapsign/service";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { CheckCircle, CircleNotch, Copy, Warning } from "@/lib/ui/icons";

const ZAPSIGN_DEFAULT_WEBHOOK_HEADER = "X-ZapSign-Webhook-Secret";

type ZapSignIntegracaoTela = ZapsignIntegrationPublica & {
  webhook_url: string | null;
  webhook_secret_once?: string;
};

interface Props {
  initial: ZapSignIntegracaoTela;
}

function dataCurta(valor: string | null, tagDoIdioma: string): string | null {
  if (!valor) return null;
  return new Date(valor).toLocaleString(tagDoIdioma);
}

export function ZapSignConfigClient({ initial }: Props) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const router = useRouter();
  const [integracao, setIntegracao] = useState<ZapSignIntegracaoTela>(initial);
  const [apiToken, setApiToken] = useState("");
  const [sandbox, setSandbox] = useState(initial.sandbox);
  const [webhookHeaderName, setWebhookHeaderName] = useState(
    initial.webhook_header_name || ZAPSIGN_DEFAULT_WEBHOOK_HEADER,
  );
  const [webhookSecret, setWebhookSecret] = useState("");
  const [testar, setTestar] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const tokenHint = useMemo(() => {
    if (!integracao.api_token_last4) return t("Nenhum token salvo ainda.");
    return `${t("Token salvo terminando em")} ${integracao.api_token_last4}`;
  }, [integracao.api_token_last4, t]);

  async function copiar(texto: string | null, sucesso: string) {
    if (!texto) return;
    if (await copyToClipboard(texto)) toast.success(t(sucesso));
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = apiToken.trim();
    if (token.length < 10) {
      toast.error(t("Cole o token ZapSign para salvar a integração."));
      return;
    }

    setSalvando(true);
    try {
      const response = await apiClient.post<ApiSuccess<ZapSignIntegracaoTela>>(
        "/api/v1/integrations/zapsign",
        {
          api_token: token,
          sandbox,
          webhook_header_name: webhookHeaderName,
          webhook_secret: webhookSecret.trim() || undefined,
          testar,
        },
      );
      setIntegracao(response.data);
      setApiToken("");
      setWebhookSecret("");
      toast.success(t("ZapSign salva e testada."));
      router.refresh();
    } catch (error) {
      showApiError(error);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{t("Conexão ZapSign")}</CardTitle>
            <CardDescription>
              {t("Guarde o token de API e copie o webhook para configurar na ZapSign.")}
            </CardDescription>
          </div>
          {integracao.last_test_ok === true ? (
            <Badge variant="success">
              <CheckCircle size={14} aria-hidden />
              {t("Teste aprovado")}
            </Badge>
          ) : integracao.last_test_ok === false ? (
            <Badge variant="error">
              <Warning size={14} aria-hidden />
              {t("Teste falhou")}
            </Badge>
          ) : (
            <Badge variant="neutral">{t("Não testada")}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={salvar}>
          <div className="space-y-2">
            <Label htmlFor="zapsign-api-token">{t("Token de API da ZapSign")}</Label>
            <Input
              id="zapsign-api-token"
              type="password"
              autoComplete="off"
              value={apiToken}
              placeholder={integracao.connected ? "••••••••••••" : ""}
              onChange={(event) => setApiToken(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {tokenHint} {t("Cole um token novo sempre que quiser trocar ou salvar a configuração.")}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div>
              <Label htmlFor="zapsign-sandbox">{t("Ambiente sandbox")}</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Use sandbox para testar sem enviar documentos reais.")}
              </p>
            </div>
            <Switch id="zapsign-sandbox" checked={sandbox} onCheckedChange={setSandbox} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="zapsign-webhook-header">{t("Header do webhook")}</Label>
            <Input
              id="zapsign-webhook-header"
              value={webhookHeaderName}
              onChange={(event) => setWebhookHeaderName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="zapsign-webhook-secret">{t("Segredo do webhook")}</Label>
            <Input
              id="zapsign-webhook-secret"
              type="password"
              autoComplete="off"
              value={webhookSecret}
              placeholder={t("Em branco gera um segredo novo")}
              onChange={(event) => setWebhookSecret(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("O segredo aparece uma única vez após salvar. Copie antes de sair da tela.")}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div>
              <Label htmlFor="zapsign-testar">{t("Testar token ao salvar")}</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("A gravação só continua se a ZapSign aceitar o token.")}
              </p>
            </div>
            <Switch id="zapsign-testar" checked={testar} onCheckedChange={setTestar} />
          </div>

          {integracao.last_test_error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {integracao.last_test_error}
            </div>
          ) : null}

          <Button type="submit" disabled={salvando}>
            {salvando ? <CircleNotch className="animate-spin" size={16} aria-hidden /> : null}
            {salvando ? t("Salvando…") : t("Salvar e testar")}
          </Button>
        </form>

        <div className="mt-6 space-y-4 rounded-md border border-border bg-muted/20 p-4">
          <div>
            <h3 className="text-sm font-medium">{t("Webhook para cadastrar na ZapSign")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Use estes dados no painel da ZapSign para receber mudança de status.")}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t("URL do webhook")}</Label>
            <div className="flex gap-2">
              <Input readOnly value={integracao.webhook_url ?? ""} placeholder="https://..." />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("Copiar URL do webhook")}
                onClick={() => copiar(integracao.webhook_url, "URL do webhook copiada.")}
              >
                <Copy size={16} aria-hidden />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("Header enviado pela ZapSign")}</Label>
            <div className="flex gap-2">
              <Input readOnly value={integracao.webhook_header_name} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("Copiar header do webhook")}
                onClick={() => copiar(integracao.webhook_header_name, "Header do webhook copiado.")}
              >
                <Copy size={16} aria-hidden />
              </Button>
            </div>
          </div>

          {integracao.webhook_secret_once ? (
            <div className="space-y-2 rounded-md border border-warning/30 bg-warning/10 p-3">
              <Label>{t("Segredo gerado agora")}</Label>
              <div className="flex gap-2">
                <Input readOnly value={integracao.webhook_secret_once} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("Copiar segredo do webhook")}
                  onClick={() => copiar(integracao.webhook_secret_once ?? null, "Segredo do webhook copiado.")}
                >
                  <Copy size={16} aria-hidden />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Depois que sair desta tela, o segredo não será mostrado de novo.")}
              </p>
            </div>
          ) : null}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t("Base da API")}</dt>
              <dd className="break-all font-medium">{integracao.base_url}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("Último teste")}</dt>
              <dd className="font-medium">
                {dataCurta(integracao.last_health_check_at, tagDoIdioma) ?? "—"}
              </dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}

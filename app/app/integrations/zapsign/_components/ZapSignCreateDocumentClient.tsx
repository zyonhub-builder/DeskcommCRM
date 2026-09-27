"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/types";
import { useT } from "@/hooks/i18n/useT";
import { CircleNotch } from "@/lib/ui/icons";

type ModeloDocumentoZapSign = {
  id: string;
  template_key: string;
  name: string;
  required_fields: string[];
  is_active: boolean;
};

interface Props {
  connected: boolean;
  modelos: ModeloDocumentoZapSign[];
}

type TipoArquivo = "pdf" | "docx";
type ModoCriacao = "arquivo" | "modelo";

export function ZapSignCreateDocumentClient({ connected, modelos }: Props) {
  const t = useT();
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [modo, setModo] = useState<ModoCriacao>("arquivo");
  const [nome, setNome] = useState("");
  const [tipoArquivo, setTipoArquivo] = useState<TipoArquivo>("pdf");
  const [urlDocumento, setUrlDocumento] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [templateDataJson, setTemplateDataJson] = useState("");
  const [signatarioNome, setSignatarioNome] = useState("");
  const [signatarioEmail, setSignatarioEmail] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [limite, setLimite] = useState("");
  const modelosAtivos = modelos.filter((modelo) => modelo.is_active);
  const modeloSelecionado = modelosAtivos.find((modelo) => modelo.template_key === templateKey);

  async function criar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected) {
      toast.error(t("A ZapSign precisa estar conectada antes de criar documentos."));
      return;
    }
    if (modo === "modelo" && !templateKey) {
      toast.error(t("Escolha um modelo ZapSign para criar o documento."));
      return;
    }

    let templateData: Record<string, string> | undefined;
    if (modo === "modelo" && templateDataJson.trim()) {
      try {
        const parsed = JSON.parse(templateDataJson) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error(t("Os dados do modelo precisam ser um objeto JSON."));
          return;
        }
        templateData = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) =>
            typeof value === "string" ? [[key, value]] : [],
          ),
        );
      } catch {
        toast.error(t("JSON dos dados do modelo inválido."));
        return;
      }
    }

    setCriando(true);
    try {
      await apiClient.post<ApiSuccess<{ documento: unknown }>>(
        "/api/v1/integrations/zapsign/documents",
        {
          modo,
          nome: nome.trim() || undefined,
          tipo_arquivo: tipoArquivo,
          url_documento: modo === "arquivo" ? urlDocumento.trim() : undefined,
          template_key: modo === "modelo" ? templateKey : undefined,
          template_data: templateData,
          signatario_nome: signatarioNome.trim(),
          signatario_email: signatarioEmail.trim(),
          enviar_email: enviarEmail,
          date_limit_to_sign: limite || undefined,
        },
      );
      setNome("");
      setUrlDocumento("");
      setTemplateDataJson("");
      setSignatarioNome("");
      setSignatarioEmail("");
      setLimite("");
      toast.success(t("Documento ZapSign criado."));
      router.refresh();
    } catch (error) {
      showApiError(error);
    } finally {
      setCriando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Criar documento de teste")}</CardTitle>
        <CardDescription>
          {t("Valide a conexão criando por URL de arquivo ou por um modelo cadastrado.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!connected ? (
          <div className="mb-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-muted-foreground">
            {t("A ZapSign precisa estar conectada antes de criar documentos.")}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={criar}>
          <div className="space-y-2">
            <Label htmlFor="zapsign-doc-nome">{t("Nome do documento")}</Label>
            <Input
              id="zapsign-doc-nome"
              value={nome}
              placeholder={t("Contrato de prestação de serviços")}
              onChange={(event) => setNome(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="zapsign-doc-modo">{t("Origem do documento")}</Label>
            <select
              id="zapsign-doc-modo"
              className="flex h-10 w-full rounded-sm border border-border bg-bg px-3 py-2 text-sm text-text"
              value={modo}
              onChange={(event) => setModo(event.target.value as ModoCriacao)}
            >
              <option value="arquivo">{t("Arquivo por URL")}</option>
              <option value="modelo">{t("Modelo cadastrado")}</option>
            </select>
          </div>

          {modo === "arquivo" ? (
            <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="zapsign-doc-tipo">{t("Tipo de arquivo")}</Label>
                <select
                  id="zapsign-doc-tipo"
                  className="flex h-10 w-full rounded-sm border border-border bg-bg px-3 py-2 text-sm text-text"
                  value={tipoArquivo}
                  onChange={(event) => setTipoArquivo(event.target.value as TipoArquivo)}
                >
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zapsign-doc-url">{t("URL do arquivo")}</Label>
                <Input
                  id="zapsign-doc-url"
                  type="url"
                  required
                  value={urlDocumento}
                  placeholder="https://..."
                  onChange={(event) => setUrlDocumento(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="zapsign-doc-modelo">{t("Modelo ZapSign")}</Label>
                <select
                  id="zapsign-doc-modelo"
                  className="flex h-10 w-full rounded-sm border border-border bg-bg px-3 py-2 text-sm text-text"
                  value={templateKey}
                  onChange={(event) => setTemplateKey(event.target.value)}
                >
                  <option value="">{t("Selecione um modelo")}</option>
                  {modelosAtivos.map((modelo) => (
                    <option key={modelo.id} value={modelo.template_key}>
                      {modelo.name} ({modelo.template_key})
                    </option>
                  ))}
                </select>
                {modelosAtivos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("Cadastre um modelo abaixo antes de testar por modelo.")}
                  </p>
                ) : null}
              </div>

              {modeloSelecionado?.required_fields.length ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  {t("Campos esperados")}: {modeloSelecionado.required_fields.join(", ")}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="zapsign-template-data">{t("Dados do modelo em JSON")}</Label>
                <Textarea
                  id="zapsign-template-data"
                  rows={5}
                  value={templateDataJson}
                  placeholder={'{"{{Nome}}":"Maria Cliente"}'}
                  onChange={(event) => setTemplateDataJson(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("Opcional")}</p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="zapsign-signer-name">{t("Nome do signatário")}</Label>
              <Input
                id="zapsign-signer-name"
                required
                value={signatarioNome}
                placeholder={t("Maria Cliente")}
                onChange={(event) => setSignatarioNome(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zapsign-signer-email">{t("E-mail do signatário")}</Label>
              <Input
                id="zapsign-signer-email"
                type="email"
                required
                value={signatarioEmail}
                placeholder="maria@example.com"
                onChange={(event) => setSignatarioEmail(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="zapsign-date-limit">{t("Data limite para assinar")}</Label>
              <Input
                id="zapsign-date-limit"
                type="date"
                value={limite}
                onChange={(event) => setLimite(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("Opcional")}</p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <Label htmlFor="zapsign-enviar-email">{t("Enviar convite por e-mail")}</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("A ZapSign dispara o convite para o signatário.")}
                </p>
              </div>
              <Switch
                id="zapsign-enviar-email"
                checked={enviarEmail}
                onCheckedChange={setEnviarEmail}
              />
            </div>
          </div>

          <Button type="submit" disabled={criando || !connected}>
            {criando ? <CircleNotch className="animate-spin" size={16} aria-hidden /> : null}
            {criando ? t("Criando…") : t("Criar documento")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

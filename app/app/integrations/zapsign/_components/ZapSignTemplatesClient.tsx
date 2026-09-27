"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/types";
import { useT } from "@/hooks/i18n/useT";
import { CircleNotch, PencilSimple, Plus } from "@/lib/ui/icons";
import type { ZapsignDocumentTemplatePublico } from "@/lib/zapsign/service";

type AgenteResumo = {
  id: string;
  name: string;
};

type Props = {
  modelos: ZapsignDocumentTemplatePublico[];
  agentes: AgenteResumo[];
};

const VAZIO = {
  id: "",
  template_key: "",
  name: "",
  description: "",
  zapsign_template_id: "",
  required_fields: "",
  template_data_defaults: "",
  agent_id: "",
  is_active: true,
  is_default: false,
  default_for_agent: false,
};

function camposParaTexto(campos: string[]): string {
  return campos.join("\n");
}

function textoParaCampos(texto: string): string[] {
  return texto
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ZapSignTemplatesClient({ modelos, agentes }: Props) {
  const t = useT();
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const editando = Boolean(form.id);

  function atualizar<K extends keyof typeof VAZIO>(key: K, value: (typeof VAZIO)[K]) {
    setForm((atual) => ({ ...atual, [key]: value }));
  }

  function editar(modelo: ZapsignDocumentTemplatePublico) {
    setForm({
      id: modelo.id,
      template_key: modelo.template_key,
      name: modelo.name,
      description: modelo.description ?? "",
      zapsign_template_id: modelo.zapsign_template_id,
      required_fields: camposParaTexto(modelo.required_fields),
      template_data_defaults: JSON.stringify(modelo.template_data_defaults, null, 2),
      agent_id: modelo.agent_id ?? "",
      is_active: modelo.is_active,
      is_default: modelo.is_default,
      default_for_agent: modelo.default_for_agent,
    });
  }

  function limpar() {
    setForm(VAZIO);
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let defaults: Record<string, string> = {};
    if (form.template_data_defaults.trim()) {
      try {
        const parsed = JSON.parse(form.template_data_defaults) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error(t("Os defaults precisam ser um objeto JSON."));
          return;
        }
        defaults = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) =>
            typeof value === "string" ? [[key, value]] : [],
          ),
        );
      } catch {
        toast.error(t("JSON dos defaults inválido."));
        return;
      }
    }

    setSalvando(true);
    try {
      await apiClient.post<ApiSuccess<{ modelo: ZapsignDocumentTemplatePublico }>>(
        "/api/v1/integrations/zapsign/templates",
        {
          id: form.id || undefined,
          template_key: form.template_key,
          nome: form.name,
          descricao: form.description || null,
          zapsign_template_id: form.zapsign_template_id,
          required_fields: textoParaCampos(form.required_fields),
          template_data_defaults: defaults,
          agent_id: form.agent_id || null,
          is_active: form.is_active,
          is_default: form.is_default,
          default_for_agent: form.default_for_agent,
        },
      );
      toast.success(editando ? t("Modelo ZapSign atualizado.") : t("Modelo ZapSign criado."));
      limpar();
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
        <CardTitle>{t("Modelos de contrato")}</CardTitle>
        <CardDescription>
          {t("Defina qual modelo ZapSign cada área ou agente deve usar ao gerar contrato.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={salvar}>
          <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="zapsign-template-key">{t("Chave da área")}</Label>
              <Input
                id="zapsign-template-key"
                required
                value={form.template_key}
                placeholder="previdenciario"
                onChange={(event) => atualizar("template_key", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zapsign-template-name">{t("Nome do modelo")}</Label>
              <Input
                id="zapsign-template-name"
                required
                value={form.name}
                placeholder={t("Contrato Previdenciário")}
                onChange={(event) => atualizar("name", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <Label htmlFor="zapsign-template-id">{t("ID do modelo na ZapSign")}</Label>
              <Input
                id="zapsign-template-id"
                required
                value={form.zapsign_template_id}
                placeholder="uuid-ou-id-do-modelo"
                onChange={(event) => atualizar("zapsign_template_id", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zapsign-template-agent">{t("Agente padrão")}</Label>
              <select
                id="zapsign-template-agent"
                className="flex h-10 w-full rounded-sm border border-border bg-bg px-3 py-2 text-sm text-text"
                value={form.agent_id}
                onChange={(event) => {
                  const agentId = event.target.value;
                  setForm((atual) => ({
                    ...atual,
                    agent_id: agentId,
                    default_for_agent: agentId ? atual.default_for_agent : false,
                  }));
                }}
              >
                <option value="">{t("Nenhum")}</option>
                {agentes.map((agente) => (
                  <option key={agente.id} value={agente.id}>
                    {agente.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zapsign-template-description">{t("Quando usar")}</Label>
            <Textarea
              id="zapsign-template-description"
              rows={3}
              value={form.description}
              placeholder={t(
                "Use para clientes qualificados em auxílio-acidente, BPC/LOAS e revisão previdenciária.",
              )}
              onChange={(event) => atualizar("description", event.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="zapsign-template-fields">
                {t("Campos que o agente precisa coletar")}
              </Label>
              <Textarea
                id="zapsign-template-fields"
                rows={5}
                value={form.required_fields}
                placeholder={"{{Nome}}\n{{CPF}}\n{{Endereco}}"}
                onChange={(event) => atualizar("required_fields", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zapsign-template-defaults">{t("Defaults enviados ao modelo")}</Label>
              <Textarea
                id="zapsign-template-defaults"
                rows={5}
                value={form.template_data_defaults}
                placeholder={'{"{{Escritorio}}":"Talismã Advocacia"}'}
                onChange={(event) => atualizar("template_data_defaults", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <span className="text-sm">{t("Ativo")}</span>
              <Switch
                checked={form.is_active}
                onCheckedChange={(value) => atualizar("is_active", value)}
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <span className="text-sm">{t("Padrão da empresa")}</span>
              <Switch
                checked={form.is_default}
                onCheckedChange={(value) => atualizar("is_default", value)}
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <span className="text-sm">{t("Padrão do agente")}</span>
              <Switch
                checked={form.default_for_agent}
                disabled={!form.agent_id}
                onCheckedChange={(value) => atualizar("default_for_agent", value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={salvando}>
              {salvando ? (
                <CircleNotch className="animate-spin" size={16} aria-hidden />
              ) : (
                <Plus size={16} aria-hidden />
              )}
              {editando ? t("Salvar modelo") : t("Criar modelo")}
            </Button>
            {editando ? (
              <Button type="button" variant="outline" onClick={limpar}>
                {t("Cancelar edição")}
              </Button>
            ) : null}
          </div>
        </form>

        {modelos.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("Nenhum modelo ZapSign cadastrado ainda.")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Modelo")}</TableHead>
                <TableHead>{t("Chave")}</TableHead>
                <TableHead>{t("Agente")}</TableHead>
                <TableHead>{t("Uso")}</TableHead>
                <TableHead className="text-right">{t("Ações")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelos.map((modelo) => {
                const agente = agentes.find((item) => item.id === modelo.agent_id);
                return (
                  <TableRow key={modelo.id}>
                    <TableCell>
                      <div className="font-medium">{modelo.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {modelo.zapsign_template_id}
                      </div>
                    </TableCell>
                    <TableCell>{modelo.template_key}</TableCell>
                    <TableCell>{agente?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={modelo.is_active ? "success" : "neutral"}>
                          {modelo.is_active ? t("Ativo") : t("Inativo")}
                        </Badge>
                        {modelo.is_default ? <Badge variant="info">{t("Padrão")}</Badge> : null}
                        {modelo.default_for_agent ? (
                          <Badge variant="warning">{t("Agente")}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => editar(modelo)}
                      >
                        <PencilSimple size={14} aria-hidden />
                        {t("Editar")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

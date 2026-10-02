"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, SendHorizontal, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

export type AgenteDeTeste = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  published_version: {
    id: string;
    version_number: number;
  } | null;
};

type PreviewResult = {
  final_text?: string | null;
  status: string;
  latency_ms?: number;
  stub?: boolean;
  impediments?: { code: string; message: string }[];
  guardrails?: {
    passou: boolean;
    termos: string[];
    naoAvaliados: { gate: string; porque: string }[];
  };
};

type Props = {
  agentes: AgenteDeTeste[];
  selectedAgentId: string | null;
  titulo: string;
  subtitulo: string;
};

type MensagemDeTeste = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  sent_at: string;
  includeInContext?: boolean;
  resultado?: PreviewResult;
};

function erroLegivel(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return fallback;
}

function formatarDuracao(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}s`;
}

type PainelDeTesteProps = {
  agentesCount: number;
  selected: AgenteDeTeste | null;
};

function PainelDeTeste({ agentesCount, selected }: PainelDeTesteProps) {
  const t = useT();
  const [mensagem, setMensagem] = useState("");
  const [mensagens, setMensagens] = useState<MensagemDeTeste[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const fimDaConversaRef = useRef<HTMLDivElement | null>(null);
  const version = selected?.published_version ?? null;
  const podeTestar = !!selected && !!version && mensagem.trim().length > 0 && !pending;

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    fimDaConversaRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, pending, erro]);

  async function testar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const texto = mensagem.trim();
    if (!selected || !version || !texto || pending) return;

    const pergunta: MensagemDeTeste = {
      id: crypto.randomUUID(),
      direction: "inbound",
      body: texto,
      sent_at: new Date().toISOString(),
    };
    const historico = [...mensagens.filter((item) => item.includeInContext !== false), pergunta];
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setErro(null);
    setMensagem("");
    setMensagens((atuais) => [...atuais, pergunta]);

    try {
      const response = await apiClient.post<{ data: PreviewResult }>(
        `/api/v1/ai/agents/${selected.id}/versions/${version.id}/test`,
        {
          sample_message: texto,
          sample_messages: historico.map((item) => ({
            direction: item.direction,
            body: item.body,
            sent_at: item.sent_at,
          })),
          skip_checkpoint: true,
        },
        { timeoutMs: 120_000, signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        const resposta = response.data.final_text?.trim();
        setMensagens((atuais) => [
          ...atuais,
          {
            id: crypto.randomUUID(),
            direction: "outbound",
            body: resposta || t("O agente não produziu uma resposta para esta mensagem."),
            sent_at: new Date().toISOString(),
            includeInContext: Boolean(resposta),
            resultado: response.data,
          },
        ]);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setErro(erroLegivel(cause, t("Não foi possível testar o agente.")));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function cancelarEspera() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPending(false);
    setErro(t("A espera foi interrompida. O teste enviado pode continuar no provedor."));
  }

  function limparConversa() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPending(false);
    setErro(null);
    setMensagem("");
    setMensagens([]);
  }

  return (
    <main
      data-testid="agent-test-panel"
      className="flex h-[clamp(420px,calc(100dvh-18rem),760px)] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xs"
    >
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text">
              {selected?.name ?? t("Nenhum agente disponível")}
            </h2>
            {selected?.description && (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-muted">
                {selected.description}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={limparConversa}
            disabled={mensagens.length === 0 && !erro && !pending}
            className="w-full sm:w-fit"
          >
            <Trash2 aria-hidden="true" />
            {t("Limpar conversa")}
          </Button>
        </div>
      </div>

      <div
        data-testid="agent-test-thread"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-bg p-4 sm:p-5"
      >
        {mensagens.length === 0 && !erro && (
          <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-dashed border-border bg-surface px-4 text-center text-sm text-text-muted">
            {agentesCount === 0
              ? t("Nenhum agente foi encontrado nesta empresa.")
              : version
                ? t("Envie uma mensagem para iniciar o teste.")
                : t("Este agente ainda não tem uma versão publicada para teste.")}
          </div>
        )}

        {mensagens.map((item) => (
          <div
            key={item.id}
            className={cn(
              "max-w-[820px] space-y-3 rounded-lg px-4 py-3 text-sm leading-relaxed break-words",
              item.direction === "inbound"
                ? "ml-auto bg-accent text-accent-foreground"
                : "border border-border bg-surface text-text",
            )}
          >
            <p className="text-xs font-medium opacity-75">
              {item.direction === "inbound" ? t("Você") : t("Agente")}
            </p>
            <p className="whitespace-pre-wrap">{item.body}</p>
            {item.direction === "outbound" && typeof item.resultado?.latency_ms === "number" && (
              <p className="text-xs text-text-muted">
                {t("Respondido em")} {formatarDuracao(item.resultado.latency_ms)}
              </p>
            )}
            {item.resultado?.stub && (
              <p className="text-xs text-text-muted">
                {t("Resposta gerada pelo provedor de teste desta instalação.")}
              </p>
            )}
            {item.resultado?.impediments?.map((impediment, index) => (
              <p key={`${impediment.code}:${index}`} className="text-sm text-error-fg">
                {impediment.message}
              </p>
            ))}
            {item.resultado?.guardrails && !item.resultado.guardrails.passou && (
              <p className="text-xs text-error-fg">
                {t("Revise a resposta antes de publicar mudanças no agente.")}
              </p>
            )}
          </div>
        ))}

        {pending && (
          <div className="flex max-w-[820px] items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("Gerando resposta...")}
          </div>
        )}

        {erro && (
          <div
            role="alert"
            className="max-w-[820px] rounded-lg border border-error-bg bg-error-bg px-4 py-3 text-sm text-error-fg"
          >
            {erro}
          </div>
        )}
        <div ref={fimDaConversaRef} />
      </div>

      <form onSubmit={(event) => void testar(event)} className="border-t border-border p-4 sm:p-5">
        <div className="space-y-2">
          <Label htmlFor="agent-test-message">{t("Mensagem")}</Label>
          <Textarea
            id="agent-test-message"
            value={mensagem}
            onChange={(event) => setMensagem(event.target.value)}
            disabled={!selected || !version || pending}
            maxLength={4000}
            rows={3}
            placeholder={t("Olá, gostaria de entender melhor como funciona.")}
            className="max-h-36 min-h-[92px] resize-none"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" disabled={!podeTestar}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <SendHorizontal aria-hidden="true" />
            )}
            {pending ? t("Testando") : t("Enviar teste")}
          </Button>
          {pending && (
            <Button type="button" variant="outline" onClick={cancelarEspera}>
              <Square aria-hidden="true" />
              {t("Parar")}
            </Button>
          )}
        </div>
      </form>
    </main>
  );
}

export function PortalDeTesteDeAgentes({ agentes, selectedAgentId, titulo, subtitulo }: Props) {
  const t = useT();
  const router = useRouter();
  const selected = useMemo(
    () => agentes.find((agent) => agent.id === selectedAgentId) ?? agentes[0] ?? null,
    [agentes, selectedAgentId],
  );
  const version = selected?.published_version ?? null;

  function trocarAgente(id: string) {
    router.push(`/app/ai/testes/${id}`);
  }

  async function copiarLink() {
    if (!selected || typeof window === "undefined") return;
    const url = `${window.location.origin}/app/ai/testes/${selected.id}`;
    try {
      await window.navigator.clipboard.writeText(url);
      toast.success(t("Link copiado."));
    } catch {
      toast.error(t("Não foi possível copiar o link."));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-text">{titulo}</h1>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">{subtitulo}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void copiarLink()}
          disabled={!selected}
          className="w-full sm:w-fit"
        >
          <Copy aria-hidden="true" />
          {t("Copiar link")}
        </Button>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-xs">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="agent-test-selector">{t("Agente")}</Label>
            <select
              id="agent-test-selector"
              value={selected?.id ?? ""}
              onChange={(event) => trocarAgente(event.target.value)}
              disabled={agentes.length === 0}
              className={cn(
                "flex h-11 w-full rounded-sm border border-border bg-bg px-3 text-sm text-text",
                "focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-hidden",
                "disabled:cursor-not-allowed disabled:opacity-55",
              )}
            >
              {agentes.length === 0 ? (
                <option value="">{t("Nenhum agente")}</option>
              ) : (
                agentes.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {!agent.published_version ? ` · ${t("sem versão publicada")}` : ""}
                  </option>
                ))
              )}
            </select>
          </div>
          {selected && (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Badge variant={version ? "success" : "warning"}>
                {version ? t("Publicado") : t("Sem publicação")}
              </Badge>
              {!selected.is_active && <Badge variant="neutral">{t("Inativo")}</Badge>}
            </div>
          )}
        </div>
      </section>

      <PainelDeTeste
        key={selected?.id ?? "sem-agente"}
        agentesCount={agentes.length}
        selected={selected}
      />
    </div>
  );
}

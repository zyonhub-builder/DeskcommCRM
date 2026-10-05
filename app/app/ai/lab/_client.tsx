"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Play, RefreshCw, Save, Sparkles, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

type PassoDaJornada = {
  body: string;
  delay_seconds?: number;
  note?: string | null;
};

type ModoExecucaoLaboratorio = "simulated" | "real_whatsapp";

type CenarioDaJornada = {
  id: string;
  name: string;
  description: string | null;
  channel_session_id: string | null;
  agent_id: string | null;
  execution_mode: ModoExecucaoLaboratorio;
  expected_events: EventosEsperadosLaboratorio;
  phone_number: string;
  contact_name: string | null;
  steps: PassoDaJornada[];
  default_delay_seconds: number;
  observation_seconds: number;
  is_active: boolean;
  updated_at: string;
};

type EventosEsperadosLaboratorio = {
  sign_contract: boolean;
  create_calendar_event: boolean;
  [key: string]: unknown;
};

type AnaliseIaDaRodada = {
  generated_at: string;
  model_id: string;
  model_origin: string;
  summary: string;
  gaps: string[];
  improvements: string[];
  faqs: string[];
  risks: string[];
  next_tests: string[];
};

type RoteiroGeradoDaJornada = {
  generated_at: string;
  model_id: string;
  model_origin: string;
  steps: PassoDaJornada[];
  notes: string[];
};

type RelatorioDaRodada = {
  generated_at: string;
  duration_seconds: number | null;
  status: string;
  execution_mode: ModoExecucaoLaboratorio;
  expected_events: EventosEsperadosLaboratorio;
  counts: {
    customer_messages: number;
    outbound_messages: number;
    ai_runs: number;
    ai_run_errors: number;
    zapsign_documents: number;
    signed_documents: number;
    appointments: number;
    appointments_with_meet: number;
  };
  timing: {
    first_customer_message_at: string | null;
    first_outbound_message_at: string | null;
    first_response_seconds: number | null;
  };
  transcript: Array<{
    id: string;
    at: string;
    actor: "cliente" | "crm";
    body: string | null;
    status: string;
  }>;
  effects: {
    zapsign_documents: Array<{
      id: string;
      name: string;
      status: string;
      signed_at: string | null;
      created_at: string;
    }>;
    appointments: Array<{
      id: string;
      title: string;
      status: string;
      starts_at: string;
      meeting_url: string | null;
      google_event_id: string | null;
      created_at: string;
    }>;
    ai_runs: Array<{
      id: string;
      status: string;
      error_code: string | null;
      started_at: string;
      completed_at: string | null;
      steps_count: number;
    }>;
  };
  findings: string[];
  ai_analysis?: AnaliseIaDaRodada | null;
};

type RodadaDaJornada = {
  id: string;
  scenario_id: string | null;
  agent_id: string | null;
  execution_mode: ModoExecucaoLaboratorio;
  expected_events: EventosEsperadosLaboratorio;
  phone_number: string;
  contact_name: string | null;
  script: PassoDaJornada[];
  status: "queued" | "running" | "observing" | "completed" | "failed" | "cancelled";
  current_step_index: number;
  next_step_at: string | null;
  observation_until: string | null;
  started_at: string | null;
  completed_at: string | null;
  report: RelatorioDaRodada | null;
  last_error: string | null;
  created_at: string;
};

type CanalDaJornada = {
  id: string;
  label: string;
  status: string | null;
  phone_number: string | null;
};

type AgenteDoLaboratorio = {
  id: string;
  name: string;
  is_active: boolean;
  paused_at: string | null;
  published_version_id: string | null;
};

type DadosDoLaboratorio = {
  scenarios: CenarioDaJornada[];
  runs: RodadaDaJornada[];
  channels: CanalDaJornada[];
  agents: AgenteDoLaboratorio[];
};

type ApiEnvelope<T> = { data: T };

const PASSOS_PADRAO: PassoDaJornada[] = [
  { body: "Oi", delay_seconds: 90 },
  { body: "Quero saber se tenho direito ao auxílio acidente", delay_seconds: 120 },
  {
    body: "Sofri um acidente de moto em 2025 e fiquei com sequelas na perna.",
    delay_seconds: 120,
  },
  {
    body: "Fico com dor constante e não consigo ficar mais de 30 minutos em pé.",
    delay_seconds: 120,
  },
  { body: "Sou auxiliar de logística e contribuía para o INSS.", delay_seconds: 120 },
  { body: "Recebi auxílio-doença por 2 meses e tive alta.", delay_seconds: 120 },
  {
    body: "Tenho laudo médico, exames, atestados e a carta do INSS da alta.",
    delay_seconds: 120,
  },
  { body: "Moro em São Paulo, SP.", delay_seconds: 120 },
  { body: "Não tenho recurso ou perícia marcada.", delay_seconds: 120 },
  { body: "Pode seguir com os dados do contrato.", delay_seconds: 120 },
  {
    body: "Meu nome completo é Luan Felipe Pimentel da Rocha. CPF 123.456.789-09, RG 12.345.678-9, brasileiro, solteiro, auxiliar de logística.",
    delay_seconds: 120,
  },
  {
    body: "Meu endereço é Rua das Flores, 123, Centro, São Paulo, SP, CEP 01000-000.",
    delay_seconds: 120,
  },
  { body: "Não tenho e-mail. Pode me mandar o link do contrato por aqui?", delay_seconds: 600 },
  {
    body: "Depois que eu assinar, pode marcar uma reunião segunda-feira depois das 18h.",
    delay_seconds: 180,
  },
];

const FORMULARIO_INICIAL = {
  id: "",
  name: "Talismã Advocacia · auxílio-acidente · caminho feliz",
  description:
    "Cliente de prova de conceito que passa por triagem, contrato via ZapSign e pedido de reunião pós-assinatura.",
  channel_session_id: "",
  agent_id: "",
  execution_mode: "simulated" as ModoExecucaoLaboratorio,
  sign_contract: true,
  create_calendar_event: true,
  phone_number: "",
  contact_name: "Luan Rocha",
  default_delay_seconds: 120,
  observation_seconds: 3600,
  is_active: true,
  stepsText: JSON.stringify(PASSOS_PADRAO, null, 2),
};

type FormularioLaboratorio = typeof FORMULARIO_INICIAL;

function formatarData(valor: string | null, tagDoIdioma: string): string {
  if (!valor) return "-";
  return new Intl.DateTimeFormat(tagDoIdioma, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

function formatarDuracao(segundos: number | null): string {
  if (segundos === null) return "-";
  if (segundos < 60) return `${segundos}s`;
  const min = Math.floor(segundos / 60);
  const sec = segundos % 60;
  if (min < 60) return sec ? `${min}min ${sec}s` : `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function statusDaRodada(status: RodadaDaJornada["status"]): { label: string; className: string } {
  if (status === "completed")
    return { label: "Concluída", className: "border-emerald-500/40 text-emerald-700" };
  if (status === "failed")
    return { label: "Falhou", className: "border-destructive/50 text-destructive" };
  if (status === "cancelled")
    return { label: "Cancelada", className: "border-muted-foreground/40 text-muted-foreground" };
  if (status === "observing")
    return { label: "Observando", className: "border-sky-500/40 text-sky-700" };
  if (status === "running")
    return { label: "Rodando", className: "border-amber-500/40 text-amber-700" };
  return { label: "Na fila", className: "border-muted-foreground/40 text-muted-foreground" };
}

function rotuloModoExecucao(mode: ModoExecucaoLaboratorio): string {
  return mode === "simulated" ? "Simulação sem WhatsApp" : "WhatsApp real";
}

function relatorioMarkdown(run: RodadaDaJornada, tagDoIdioma: string): string {
  const report = run.report;
  if (!report) return "";
  const analysis = report.ai_analysis;
  const linhas = [
    `# Relatório da jornada ${run.id}`,
    "",
    `Status: ${statusDaRodada(run.status).label}`,
    `Modo: ${rotuloModoExecucao(run.execution_mode)}`,
    `Telefone: ${run.phone_number}`,
    `Duração: ${formatarDuracao(report.duration_seconds)}`,
    `Primeira resposta: ${formatarDuracao(report.timing.first_response_seconds)}`,
    "",
    "## Contagens",
    `- Mensagens do cliente: ${report.counts.customer_messages}`,
    `- Respostas do CRM/IA: ${report.counts.outbound_messages}`,
    `- Execuções de IA: ${report.counts.ai_runs}`,
    `- Contratos ZapSign: ${report.counts.zapsign_documents}`,
    `- Contratos assinados: ${report.counts.signed_documents}`,
    `- Agendamentos: ${report.counts.appointments}`,
    `- Agendamentos com Meet: ${report.counts.appointments_with_meet}`,
    "",
    "## Achados",
    ...report.findings.map((finding) => `- ${finding}`),
    "",
    ...(analysis
      ? [
          "## Análise de IA",
          analysis.summary,
          "",
          "### Gaps",
          ...analysis.gaps.map((item) => `- ${item}`),
          "",
          "### Melhorias",
          ...analysis.improvements.map((item) => `- ${item}`),
          "",
          "### FAQs",
          ...analysis.faqs.map((item) => `- ${item}`),
          "",
          "### Riscos",
          ...analysis.risks.map((item) => `- ${item}`),
          "",
          "### Próximos testes",
          ...analysis.next_tests.map((item) => `- ${item}`),
          "",
        ]
      : []),
    "## Transcrição",
    ...report.transcript.map(
      (message) =>
        `- ${formatarData(message.at, tagDoIdioma)} · ${message.actor}: ${message.body ?? ""}`,
    ),
  ];
  return `${linhas.join("\n")}\n`;
}

function baixarRelatorio(run: RodadaDaJornada, tagDoIdioma: string): void {
  const markdown = relatorioMarkdown(run, tagDoIdioma);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-jornada-${run.id}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

export function LaboratorioDeJornadasClient({ habilitado }: { habilitado: boolean }) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const [dados, setDados] = useState<DadosDoLaboratorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerandoRoteiro, setGerandoRoteiro] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [completingRunId, setCompletingRunId] = useState<string | null>(null);
  const [analyzingRunId, setAnalyzingRunId] = useState<string | null>(null);
  const [cancelingRunId, setCancelingRunId] = useState<string | null>(null);
  const [resetarContato, setResetarContato] = useState(true);
  const [form, setForm] = useState<FormularioLaboratorio>(FORMULARIO_INICIAL);

  const carregar = useCallback(async () => {
    if (!habilitado) return;
    try {
      const res = await apiClient.get<ApiEnvelope<DadosDoLaboratorio>>("/api/v1/ai/lab/scenarios");
      setDados(res.data);
      setErro(null);
      const primeiroCanal = res.data.channels[0]?.id ?? "";
      const primeiroAgente = res.data.agents[0]?.id ?? "";
      setForm((atual) => ({
        ...atual,
        channel_session_id: atual.channel_session_id || primeiroCanal,
        agent_id: atual.agent_id || primeiroAgente,
      }));
    } catch (err) {
      setErro(err instanceof Error ? err.message : t("Não consegui carregar o laboratório."));
    }
  }, [habilitado]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void carregar();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [carregar]);

  const totalDoRoteiro = useMemo(() => {
    try {
      const passos = JSON.parse(form.stepsText) as PassoDaJornada[];
      return passos.reduce(
        (total, passo) => total + (passo.delay_seconds ?? form.default_delay_seconds),
        0,
      );
    } catch {
      return 0;
    }
  }, [form.default_delay_seconds, form.stepsText]);

  function editarCenario(cenario: CenarioDaJornada): void {
    setForm({
      id: cenario.id,
      name: cenario.name,
      description: cenario.description ?? "",
      channel_session_id: cenario.channel_session_id ?? "",
      agent_id: cenario.agent_id ?? "",
      execution_mode: cenario.execution_mode,
      sign_contract: cenario.expected_events.sign_contract !== false,
      create_calendar_event: cenario.expected_events.create_calendar_event !== false,
      phone_number: cenario.phone_number,
      contact_name: cenario.contact_name ?? "",
      default_delay_seconds: cenario.default_delay_seconds,
      observation_seconds: cenario.observation_seconds,
      is_active: cenario.is_active,
      stepsText: JSON.stringify(cenario.steps, null, 2),
    });
  }

  async function salvar(): Promise<void> {
    setSalvando(true);
    try {
      const steps = JSON.parse(form.stepsText) as PassoDaJornada[];
      await apiClient.post<ApiEnvelope<CenarioDaJornada>>("/api/v1/ai/lab/scenarios", {
        id: form.id || undefined,
        name: form.name,
        description: form.description || null,
        channel_session_id: form.channel_session_id || null,
        agent_id: form.agent_id || null,
        execution_mode: form.execution_mode,
        expected_events: {
          sign_contract: form.sign_contract,
          create_calendar_event: form.create_calendar_event,
        },
        phone_number: form.phone_number,
        contact_name: form.contact_name || null,
        default_delay_seconds: Number(form.default_delay_seconds),
        observation_seconds: Number(form.observation_seconds),
        is_active: form.is_active,
        steps,
      });
      setErro(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : t("Não consegui salvar o cenário."));
    } finally {
      setSalvando(false);
    }
  }

  async function gerarRoteiroComIa(): Promise<void> {
    setGerandoRoteiro(true);
    try {
      const res = await apiClient.post<ApiEnvelope<RoteiroGeradoDaJornada>>(
        "/api/v1/ai/lab/scenarios/generate",
        {
          agent_id: form.agent_id || null,
          name: form.name,
          description: form.description || null,
          expected_events: {
            sign_contract: form.sign_contract,
            create_calendar_event: form.create_calendar_event,
          },
          message_count: 14,
          default_delay_seconds: Number(form.default_delay_seconds),
        },
      );
      setForm((atual) => ({
        ...atual,
        stepsText: JSON.stringify(res.data.steps, null, 2),
      }));
      setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : t("Não consegui gerar a bateria com IA."));
    } finally {
      setGerandoRoteiro(false);
    }
  }

  async function analisarRodada(runId: string): Promise<void> {
    setAnalyzingRunId(runId);
    try {
      await apiClient.post<ApiEnvelope<RodadaDaJornada>>(
        `/api/v1/ai/lab/runs/${runId}/analyze`,
        {},
      );
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : t("Não consegui analisar a rodada com IA."));
    } finally {
      setAnalyzingRunId(null);
    }
  }

  async function iniciarRodada(cenarioId: string): Promise<void> {
    setRodando(true);
    try {
      await apiClient.post<ApiEnvelope<RodadaDaJornada>>("/api/v1/ai/lab/runs", {
        scenario_id: cenarioId,
        reset_existing_contact: resetarContato,
      });
      setErro(null);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : t("Não consegui iniciar a rodada."));
    } finally {
      setRodando(false);
    }
  }

  async function completarRodada(runId: string): Promise<void> {
    setCompletingRunId(runId);
    try {
      await apiClient.post<ApiEnvelope<RodadaDaJornada>>(
        `/api/v1/ai/lab/runs/${runId}/complete`,
        {},
      );
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : t("Não consegui gerar o relatório."));
    } finally {
      setCompletingRunId(null);
    }
  }

  async function cancelarRodada(runId: string): Promise<void> {
    setCancelingRunId(runId);
    try {
      await apiClient.post<ApiEnvelope<{ id: string; cancelled: boolean }>>(
        `/api/v1/ai/lab/runs/${runId}/cancel`,
        {},
      );
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : t("Não consegui cancelar a rodada."));
    } finally {
      setCancelingRunId(null);
    }
  }

  if (!habilitado) {
    return (
      <main className="mx-auto w-full max-w-4xl p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">{t("Laboratório indisponível")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Esta área só abre em ambiente de teste para evitar disparos reais em produção.")}
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main
      className="mx-auto w-full max-w-7xl space-y-6 p-6"
      data-testid="laboratorio-jornadas-reais"
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Laboratório")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t(
              "Rode conversas reais de teste, no ritmo de uma pessoa, e veja o que aconteceu no atendimento.",
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => void carregar()}>
          <RefreshCw size={16} aria-hidden />
          <span>{t("Atualizar")}</span>
        </Button>
      </header>

      {erro && <Card className="border-destructive/40 p-4 text-sm text-destructive">{erro}</Card>}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t("Cenário")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("O roteiro abaixo vira mensagens do contato de teste.")}
                </p>
              </div>
              <Badge variant="outline">
                {formatarDuracao(totalDoRoteiro)} {t("de roteiro")}
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lab-name">{t("Nome")}</Label>
                <Input
                  id="lab-name"
                  value={form.name}
                  onChange={(e) => setForm((atual) => ({ ...atual, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Conexão")}</Label>
                <Select
                  value={form.channel_session_id || "none"}
                  onValueChange={(value) =>
                    setForm((atual) => ({
                      ...atual,
                      channel_session_id: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("Escolha a conexão")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("Sem conexão")}</SelectItem>
                    {(dados?.channels ?? []).map((canal) => (
                      <SelectItem key={canal.id} value={canal.id}>
                        {canal.label} {canal.phone_number ? `· ${canal.phone_number}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("Agente")}</Label>
                <Select
                  value={form.agent_id || "auto"}
                  onValueChange={(value) =>
                    setForm((atual) => ({ ...atual, agent_id: value === "auto" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("Escolha o agente")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("Resolver automaticamente")}</SelectItem>
                    {(dados?.agents ?? []).map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                        {agent.paused_at ? " · pausado" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("Modo")}</Label>
                <Select
                  value={form.execution_mode}
                  onValueChange={(value) =>
                    setForm((atual) => ({
                      ...atual,
                      execution_mode: value === "real_whatsapp" ? "real_whatsapp" : "simulated",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("Escolha o modo")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simulated">{t("Simular sem WhatsApp")}</SelectItem>
                    <SelectItem value="real_whatsapp">{t("Enviar no WhatsApp real")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lab-phone">{t("Telefone do cliente de teste")}</Label>
                <Input
                  id="lab-phone"
                  placeholder="+5511999999999"
                  value={form.phone_number}
                  onChange={(e) => setForm((atual) => ({ ...atual, phone_number: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lab-contact-name">{t("Nome do cliente")}</Label>
                <Input
                  id="lab-contact-name"
                  value={form.contact_name}
                  onChange={(e) => setForm((atual) => ({ ...atual, contact_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lab-delay">{t("Atraso padrão por mensagem")}</Label>
                <Input
                  id="lab-delay"
                  type="number"
                  min={10}
                  value={form.default_delay_seconds}
                  onChange={(e) =>
                    setForm((atual) => ({
                      ...atual,
                      default_delay_seconds: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lab-observation">{t("Janela de observação final")}</Label>
                <Input
                  id="lab-observation"
                  type="number"
                  min={0}
                  value={form.observation_seconds}
                  onChange={(e) =>
                    setForm((atual) => ({ ...atual, observation_seconds: Number(e.target.value) }))
                  }
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="lab-description">{t("Descrição")}</Label>
              <Textarea
                id="lab-description"
                value={form.description}
                onChange={(e) => setForm((atual) => ({ ...atual, description: e.target.value }))}
              />
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="lab-steps">{t("Mensagens do cliente")}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void gerarRoteiroComIa()}
                  disabled={gerandoRoteiro}
                >
                  <Sparkles size={14} aria-hidden />
                  <span>{gerandoRoteiro ? t("Gerando...") : t("Gerar com IA")}</span>
                </Button>
              </div>
              <Textarea
                id="lab-steps"
                className="min-h-[360px] font-mono text-xs"
                value={form.stepsText}
                onChange={(e) => setForm((atual) => ({ ...atual, stepsText: e.target.value }))}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(checked) =>
                      setForm((atual) => ({ ...atual, is_active: checked }))
                    }
                  />
                  <span>{t("Cenário ativo")}</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.sign_contract}
                    onCheckedChange={(checked) =>
                      setForm((atual) => ({ ...atual, sign_contract: checked }))
                    }
                  />
                  <span>{t("Assinar contrato no teste")}</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.create_calendar_event}
                    onCheckedChange={(checked) =>
                      setForm((atual) => ({ ...atual, create_calendar_event: checked }))
                    }
                  />
                  <span>{t("Esperar agenda no teste")}</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setForm({
                      ...FORMULARIO_INICIAL,
                      channel_session_id: form.channel_session_id,
                      agent_id: form.agent_id,
                    })
                  }
                >
                  {t("Usar modelo")}
                </Button>
                <Button type="button" onClick={() => void salvar()} disabled={salvando}>
                  <Save size={16} aria-hidden />
                  <span>{salvando ? t("Salvando...") : t("Salvar cenário")}</span>
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t("Rodar teste")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("A execução usa o cenário salvo.")}
                </p>
              </div>
            </div>
            <label className="mb-4 flex items-center gap-2 text-sm">
              <Switch checked={resetarContato} onCheckedChange={setResetarContato} />
              <span>{t("Apagar o histórico desse telefone antes de rodar")}</span>
            </label>
            <div className="space-y-3">
              {(dados?.scenarios ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("Salve um cenário para iniciar a primeira rodada.")}
                </p>
              )}
              {(dados?.scenarios ?? []).map((cenario) => (
                <div key={cenario.id} className="rounded-sm border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium">{cenario.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {cenario.steps.length} {t("mensagens")} · {cenario.phone_number} ·{" "}
                        {rotuloModoExecucao(cenario.execution_mode)}
                      </p>
                    </div>
                    <Badge variant="outline">{cenario.is_active ? t("Ativo") : t("Inativo")}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => editarCenario(cenario)}>
                      {t("Editar")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void iniciarRodada(cenario.id)}
                      disabled={rodando || !cenario.is_active}
                    >
                      <Play size={14} aria-hidden />
                      <span>
                        {cenario.execution_mode === "simulated"
                          ? t("Rodar simulação")
                          : t("Enviar teste real")}
                      </span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("Rodadas recentes")}</h2>
        {(dados?.runs ?? []).length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            {t("Nenhuma rodada iniciada ainda.")}
          </Card>
        ) : (
          <div className="grid gap-4">
            {(dados?.runs ?? []).map((run) => {
              const status = statusDaRodada(run.status);
              return (
                <Card key={run.id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">
                          {t("Rodada")} {run.id.slice(0, 8)}
                        </h3>
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                        <Badge variant="outline">{rotuloModoExecucao(run.execution_mode)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {run.phone_number} · passo{" "}
                        {Math.min(run.current_step_index, run.script.length)} de {run.script.length}{" "}
                        · {t("início")} {formatarData(run.started_at, tagDoIdioma)}
                      </p>
                      {run.next_step_at && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("Próxima mensagem em")} {formatarData(run.next_step_at, tagDoIdioma)}
                        </p>
                      )}
                      {run.observation_until && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("Observando até")} {formatarData(run.observation_until, tagDoIdioma)}
                        </p>
                      )}
                      {run.last_error && (
                        <p className="mt-2 text-sm text-destructive">{run.last_error}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["queued", "running", "observing"].includes(run.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void cancelarRodada(run.id)}
                          disabled={cancelingRunId === run.id}
                        >
                          <Square size={14} aria-hidden />
                          <span>{t("Cancelar")}</span>
                        </Button>
                      )}
                      {run.status !== "completed" && run.status !== "cancelled" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void completarRodada(run.id)}
                          disabled={completingRunId === run.id}
                        >
                          {t("Gerar relatório")}
                        </Button>
                      )}
                      {run.report && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void analisarRodada(run.id)}
                          disabled={analyzingRunId === run.id}
                        >
                          <Sparkles size={14} aria-hidden />
                          <span>
                            {run.report.ai_analysis
                              ? t("Refazer análise IA")
                              : t("Analisar com IA")}
                          </span>
                        </Button>
                      )}
                      {run.report && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => baixarRelatorio(run, tagDoIdioma)}
                        >
                          <Download size={14} aria-hidden />
                          <span>{t("Baixar relatório")}</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {run.report && (
                    <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                      <div className="rounded-sm border border-border p-3">
                        <h4 className="text-sm font-medium">{t("Resumo")}</h4>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("Cliente")}</dt>
                            <dd>{run.report.counts.customer_messages}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">CRM/IA</dt>
                            <dd>{run.report.counts.outbound_messages}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">IA</dt>
                            <dd>
                              {run.report.counts.ai_runs}
                              {run.report.counts.ai_run_errors > 0
                                ? ` / ${run.report.counts.ai_run_errors} ${t("falhas")}`
                                : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("1a resposta")}</dt>
                            <dd>{formatarDuracao(run.report.timing.first_response_seconds)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("Contratos")}</dt>
                            <dd>
                              {run.report.counts.zapsign_documents} /{" "}
                              {run.report.counts.signed_documents} {t("assinados")}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t("Agenda")}</dt>
                            <dd>
                              {run.report.counts.appointments} /{" "}
                              {run.report.counts.appointments_with_meet} {t("com Meet")}
                            </dd>
                          </div>
                        </dl>
                        <ul className="mt-3 space-y-2 text-sm">
                          {run.report.findings.map((finding) => (
                            <li key={finding} className="rounded-sm bg-muted px-3 py-2">
                              {finding}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-sm border border-border p-3">
                        <h4 className="text-sm font-medium">{t("Transcrição observada")}</h4>
                        <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-2">
                          {run.report.transcript.slice(-20).map((message) => (
                            <div key={message.id} className="rounded-sm bg-muted px-3 py-2 text-sm">
                              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                <span>{message.actor === "cliente" ? t("Cliente") : "CRM/IA"}</span>
                                <span>{formatarData(message.at, tagDoIdioma)}</span>
                              </div>
                              <p className="whitespace-pre-wrap">{message.body}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {run.report.ai_analysis && (
                        <div className="rounded-sm border border-border p-3 lg:col-span-2">
                          <h4 className="text-sm font-medium">{t("Análise de IA")}</h4>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {run.report.ai_analysis.summary}
                          </p>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {[
                              [t("Gaps"), run.report.ai_analysis.gaps],
                              [t("Melhorias"), run.report.ai_analysis.improvements],
                              [t("FAQs"), run.report.ai_analysis.faqs],
                              [t("Riscos"), run.report.ai_analysis.risks],
                              [t("Próximos testes"), run.report.ai_analysis.next_tests],
                            ].map(([titulo, itens]) => (
                              <div key={String(titulo)} className="rounded-sm bg-muted p-3">
                                <h5 className="text-xs font-medium text-muted-foreground uppercase">
                                  {String(titulo)}
                                </h5>
                                <ul className="mt-2 space-y-1 text-sm">
                                  {(itens as string[]).map((item) => (
                                    <li key={item}>- {item}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

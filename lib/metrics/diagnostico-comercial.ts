import type { Json } from "@/lib/database.types";

export interface LeadDiagnosticoRow {
  id: string;
  created_at: string;
  closed_at: string | null;
  status: string;
  source: string | null;
  source_metadata: Json | null;
  lost_reason: string | null;
  owner_kind: string | null;
  owner_user_id: string | null;
  owner_agent_id: string | null;
}

export interface MessageDiagnosticoRow {
  conversation_id: string;
  direction: string;
  sent_via: string | null;
  sent_at: string;
}

export interface ConversationDiagnosticoRow {
  id: string;
  status: string;
  last_handoff_at: string | null;
  awaiting_since: string | null;
  last_message_at: string | null;
}

export interface LlmCallDiagnosticoRow {
  purpose: string | null;
  status: string;
  cost_cents: number | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface CapturaDiagnosticoRow {
  outcome: string;
  source_name: string | null;
  origin: string | null;
  lead_id: string | null;
  utm: Json | null;
}

export interface AtividadeDiagnosticoRow {
  actor_kind: string | null;
  type: string;
}

export interface JanelaDiagnostico {
  from: string;
  to: string;
  dias: number;
}

export interface BaldeContagem {
  chave: string;
  quantidade: number;
}

export interface OrigemResumo extends BaldeContagem {
  campanha: string | null;
  rastreado: number;
}

export interface SinalDiagnostico {
  eixo: "aquisicao" | "comercial" | "operacao" | "ia" | "dados";
  nivel: "bom" | "atencao" | "critico" | "neutro";
  titulo: string;
  descricao: string;
  acao: string;
  evidencia: string;
}

export interface DiagnosticoComercialPayload {
  janela: JanelaDiagnostico;
  regua: {
    leitura_sem_ia: true;
    custo_da_tela_cents: 0;
    limite_linhas_por_fonte: number;
    truncado: boolean;
    observacoes: string[];
  };
  aquisicao: {
    leads_criados: number;
    leads_com_origem_rastreavel: number;
    percentual_rastreado: number | null;
    origens: OrigemResumo[];
    captacoes_webhook: number;
    captacoes_por_desfecho: BaldeContagem[];
  };
  funil: {
    fechados: number;
    ganhos: number;
    perdidos: number;
    taxa_ganho_fechados: number | null;
    abertos_criados_no_periodo: number;
    perdidos_por_motivo: BaldeContagem[];
  };
  atendimento: {
    conversas_ativas: number;
    aguardando_resposta: number;
    handoffs: number;
    mensagens_entrada: number;
    mensagens_saida: number;
    saidas_por_autoria: BaldeContagem[];
    conversas_com_entrada: number;
    conversas_sem_resposta_apos_entrada: number;
    mediana_primeira_resposta_segundos: number | null;
    mediana_primeira_resposta_humana_segundos: number | null;
  };
  atividades: {
    total: number;
    por_ator: BaldeContagem[];
    por_tipo: BaldeContagem[];
  };
  ia: {
    chamadas: number;
    erros: number;
    custo_cents: number;
    custo_analise_cents: number;
    latencia_p50_ms: number | null;
    por_finalidade: Array<BaldeContagem & { custo_cents: number }>;
  };
  diagnostico: {
    foco: "dados_insuficientes" | "rastreio" | "aquisicao" | "comercial" | "operacao" | "misto";
    titulo: string;
    resumo: string;
    sinais: SinalDiagnostico[];
    proximos_passos: string[];
    nao_medido: string[];
  };
}

interface MontarDiagnosticoInput {
  janela: JanelaDiagnostico;
  limite: number;
  truncado: boolean;
  leadsCriados: readonly LeadDiagnosticoRow[];
  leadsFechados: readonly LeadDiagnosticoRow[];
  mensagens: readonly MessageDiagnosticoRow[];
  conversas: readonly ConversationDiagnosticoRow[];
  chamadasIa: readonly LlmCallDiagnosticoRow[];
  captacoes: readonly CapturaDiagnosticoRow[];
  atividades: readonly AtividadeDiagnosticoRow[];
}

const SEM_ORIGEM = "sem origem";
const SEM_MOTIVO = "sem motivo registrado";
const SEM_FINALIDADE = "sem finalidade";

function objetoJson(valor: Json | null | undefined): Record<string, Json | undefined> | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  return valor;
}

function textoJson(valor: Json | undefined): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

function primeiroTexto(valor: Json | null | undefined, chaves: readonly string[]): string | null {
  const obj = objetoJson(valor);
  if (!obj) return null;
  for (const chave of chaves) {
    const texto = textoJson(obj[chave]);
    if (texto) return texto;
  }
  return null;
}

function temOrigemRastreavel(lead: LeadDiagnosticoRow): boolean {
  const meta = objetoJson(lead.source_metadata);
  if (!meta) return false;
  return [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "campaign_name",
    "ad_platform",
    "gclid",
    "fbclid",
  ].some((chave) => textoJson(meta[chave]) !== null);
}

function origemDoLead(lead: LeadDiagnosticoRow): { origem: string; campanha: string | null } {
  const meta = lead.source_metadata;
  const origem =
    primeiroTexto(meta, ["utm_source", "ad_platform", "source", "source_name"]) ??
    lead.source?.trim() ??
    SEM_ORIGEM;
  const campanha = primeiroTexto(meta, ["utm_campaign", "campaign_name", "campaign_id"]);
  return { origem, campanha };
}

function porcentagem(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return parte / total;
}

function contar(chaves: readonly (string | null | undefined)[], vazio: string): BaldeContagem[] {
  const mapa = new Map<string, number>();
  for (const chave of chaves) {
    const rotulo = chave?.trim() || vazio;
    mapa.set(rotulo, (mapa.get(rotulo) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([chave, quantidade]) => ({ chave, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.chave.localeCompare(b.chave, "pt-BR"));
}

function mediana(valores: readonly number[]): number | null {
  const ordenados = valores.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (ordenados.length === 0) return null;
  const meio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[meio] ?? null;
  return Math.round(((ordenados[meio - 1] ?? 0) + (ordenados[meio] ?? 0)) / 2);
}

function top<T extends BaldeContagem>(linhas: readonly T[], limite = 8): T[] {
  return [...linhas].slice(0, limite);
}

function segundosEntre(de: string, ate: string): number {
  return Math.max(0, Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 1000));
}

function dentroDaJanela(iso: string | null, janela: JanelaDiagnostico): boolean {
  if (!iso) return false;
  const valor = new Date(iso).getTime();
  return valor >= new Date(janela.from).getTime() && valor < new Date(janela.to).getTime();
}

function montarOrigens(leads: readonly LeadDiagnosticoRow[]): OrigemResumo[] {
  const mapa = new Map<string, OrigemResumo>();
  for (const lead of leads) {
    const { origem, campanha } = origemDoLead(lead);
    const chave = `${origem}|||${campanha ?? ""}`;
    const atual = mapa.get(chave) ?? { chave: origem, campanha, quantidade: 0, rastreado: 0 };
    atual.quantidade += 1;
    if (temOrigemRastreavel(lead)) atual.rastreado += 1;
    mapa.set(chave, atual);
  }
  return top(
    [...mapa.values()].sort(
      (a, b) => b.quantidade - a.quantidade || a.chave.localeCompare(b.chave, "pt-BR"),
    ),
  );
}

function calculaPrimeirasRespostas(mensagens: readonly MessageDiagnosticoRow[]) {
  const porConversa = new Map<string, MessageDiagnosticoRow[]>();
  for (const mensagem of mensagens) {
    const lista = porConversa.get(mensagem.conversation_id) ?? [];
    lista.push(mensagem);
    porConversa.set(mensagem.conversation_id, lista);
  }

  const qualquerResposta: number[] = [];
  const respostaHumana: number[] = [];
  let comEntrada = 0;
  let semResposta = 0;

  for (const lista of porConversa.values()) {
    lista.sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
    const primeiraEntrada = lista.find((m) => m.direction === "inbound");
    if (!primeiraEntrada) continue;
    comEntrada += 1;

    const resposta = lista.find(
      (m) =>
        m.direction === "outbound" &&
        new Date(m.sent_at).getTime() >= new Date(primeiraEntrada.sent_at).getTime(),
    );
    if (resposta) qualquerResposta.push(segundosEntre(primeiraEntrada.sent_at, resposta.sent_at));
    else semResposta += 1;

    const humana = lista.find(
      (m) =>
        m.direction === "outbound" &&
        ["user", "external_device"].includes(m.sent_via ?? "") &&
        new Date(m.sent_at).getTime() >= new Date(primeiraEntrada.sent_at).getTime(),
    );
    if (humana) respostaHumana.push(segundosEntre(primeiraEntrada.sent_at, humana.sent_at));
  }

  return {
    conversasComEntrada: comEntrada,
    conversasSemResposta: semResposta,
    medianaPrimeiraResposta: mediana(qualquerResposta),
    medianaPrimeiraRespostaHumana: mediana(respostaHumana),
  };
}

function finalidadeDeAnalise(purpose: string | null): boolean {
  const p = (purpose ?? "").toLowerCase();
  return (
    p.includes("analise") ||
    p.includes("analysis") ||
    p.includes("diagnostico") ||
    p.includes("evaluation") ||
    p.includes("evolution") ||
    p.includes("whatsapp_history")
  );
}

function montarSinais(input: {
  leadsCriados: number;
  percentualRastreado: number | null;
  taxaGanho: number | null;
  conversasComEntrada: number;
  conversasSemResposta: number;
  medianaHumana: number | null;
  custoAnalise: number;
  truncado: boolean;
}): SinalDiagnostico[] {
  const sinais: SinalDiagnostico[] = [];

  if (input.leadsCriados < 10) {
    sinais.push({
      eixo: "dados",
      nivel: "atencao",
      titulo: "Amostra pequena",
      descricao: "O período ainda tem poucos leads criados para cravar tendência.",
      acao: "Use como leitura inicial e volte a medir com mais volume.",
      evidencia: `${input.leadsCriados} leads criados no período.`,
    });
  }

  if (input.percentualRastreado !== null && input.percentualRastreado < 0.6) {
    sinais.push({
      eixo: "aquisicao",
      nivel: "critico",
      titulo: "Origem pouco rastreada",
      descricao: "Parte relevante dos leads chegou sem UTM/campanha identificável.",
      acao: "Padronizar links rastreáveis e UTMs antes de discutir qualidade do tráfego.",
      evidencia: `${Math.round(input.percentualRastreado * 100)}% dos leads criados têm origem rastreável.`,
    });
  }

  const taxaSemResposta = porcentagem(input.conversasSemResposta, input.conversasComEntrada);
  if (taxaSemResposta !== null && taxaSemResposta >= 0.25) {
    sinais.push({
      eixo: "comercial",
      nivel: "critico",
      titulo: "Entradas sem resposta no período",
      descricao: "Há conversas com mensagem do lead e sem resposta posterior registrada na janela.",
      acao: "Auditar fila, dono do atendimento e regra de follow-up para essas conversas.",
      evidencia: `${input.conversasSemResposta} de ${input.conversasComEntrada} conversas com entrada ficaram sem resposta posterior.`,
    });
  }

  if (input.medianaHumana !== null && input.medianaHumana > 2 * 60 * 60) {
    sinais.push({
      eixo: "comercial",
      nivel: "atencao",
      titulo: "Resposta humana lenta",
      descricao: "A mediana até a primeira resposta humana passou de duas horas.",
      acao: "Comparar janela de chegada dos leads com escala real de atendimento.",
      evidencia: `Mediana humana de ${Math.round(input.medianaHumana / 60)} minutos.`,
    });
  }

  if (input.taxaGanho !== null && input.taxaGanho < 0.1 && input.leadsCriados >= 10) {
    sinais.push({
      eixo: "operacao",
      nivel: "atencao",
      titulo: "Fechamento baixo",
      descricao: "A taxa de ganho sobre negócios fechados está baixa para o período.",
      acao: "Cruzar motivos de perda com tempo de resposta antes de culpar a origem.",
      evidencia: `${Math.round(input.taxaGanho * 100)}% de ganho entre negócios fechados.`,
    });
  }

  sinais.push({
    eixo: "ia",
    nivel: input.custoAnalise > 0 ? "neutro" : "bom",
    titulo: "Abertura sem custo de IA",
    descricao: "Este diagnóstico usa agregados do banco e não chama modelo ao abrir a tela.",
    acao: "Reservar IA semântica para fechamento, perda ou auditoria sob demanda.",
    evidencia:
      input.custoAnalise > 0
        ? `${input.custoAnalise} centavos registrados em finalidades de análise no período.`
        : "0 centavos de IA consumidos por esta leitura objetiva.",
  });

  if (input.truncado) {
    sinais.push({
      eixo: "dados",
      nivel: "atencao",
      titulo: "Leitura cortada pelo teto",
      descricao: "Ao menos uma fonte bateu no limite de linhas da rota.",
      acao: "Reduzir o período ou criar agregação SQL dedicada para este volume.",
      evidencia: "A rota marcou truncado=true.",
    });
  }

  return sinais;
}

function focoDosSinais(
  sinais: readonly SinalDiagnostico[],
): DiagnosticoComercialPayload["diagnostico"]["foco"] {
  const criticos = sinais.filter((s) => s.nivel === "critico");
  if (sinais.some((s) => s.eixo === "dados" && s.titulo === "Amostra pequena"))
    return "dados_insuficientes";
  if (criticos.some((s) => s.eixo === "aquisicao")) return "rastreio";
  if (criticos.some((s) => s.eixo === "comercial")) return "comercial";
  if (sinais.some((s) => s.eixo === "operacao" && s.nivel !== "bom")) return "operacao";
  return sinais.filter((s) => s.nivel !== "bom" && s.nivel !== "neutro").length > 1
    ? "misto"
    : "aquisicao";
}

export function montarDiagnosticoComercial(
  input: MontarDiagnosticoInput,
): DiagnosticoComercialPayload {
  const leadsComOrigem = input.leadsCriados.filter(temOrigemRastreavel).length;
  const fechados = input.leadsFechados.filter((l) => l.closed_at);
  const ganhos = fechados.filter((l) => l.status === "won").length;
  const perdidos = fechados.filter((l) => l.status === "lost").length;
  const taxaGanho = porcentagem(ganhos, ganhos + perdidos);

  const mensagensEntrada = input.mensagens.filter((m) => m.direction === "inbound").length;
  const mensagensSaida = input.mensagens.filter((m) => m.direction === "outbound").length;
  const respostas = calculaPrimeirasRespostas(input.mensagens);
  const chamadasComLatencia = input.chamadasIa
    .map((c) => c.latency_ms)
    .filter((v): v is number => typeof v === "number");
  const custoAnalise = input.chamadasIa
    .filter((c) => finalidadeDeAnalise(c.purpose))
    .reduce((acc, c) => acc + (c.cost_cents ?? 0), 0);
  const porFinalidade = new Map<
    string,
    { chave: string; quantidade: number; custo_cents: number }
  >();
  for (const chamada of input.chamadasIa) {
    const chave = chamada.purpose?.trim() || SEM_FINALIDADE;
    const atual = porFinalidade.get(chave) ?? { chave, quantidade: 0, custo_cents: 0 };
    atual.quantidade += 1;
    atual.custo_cents += chamada.cost_cents ?? 0;
    porFinalidade.set(chave, atual);
  }

  const sinais = montarSinais({
    leadsCriados: input.leadsCriados.length,
    percentualRastreado: porcentagem(leadsComOrigem, input.leadsCriados.length),
    taxaGanho,
    conversasComEntrada: respostas.conversasComEntrada,
    conversasSemResposta: respostas.conversasSemResposta,
    medianaHumana: respostas.medianaPrimeiraRespostaHumana,
    custoAnalise,
    truncado: input.truncado,
  });
  const foco = focoDosSinais(sinais);

  return {
    janela: input.janela,
    regua: {
      leitura_sem_ia: true,
      custo_da_tela_cents: 0,
      limite_linhas_por_fonte: input.limite,
      truncado: input.truncado,
      observacoes: [
        "Janela semiaberta [from, to).",
        "Mensagem analisada por metadados; o corpo da conversa não é lido neste MVP.",
        "Taxa de ganho usa negócios fechados no período, não leads criados no período.",
      ],
    },
    aquisicao: {
      leads_criados: input.leadsCriados.length,
      leads_com_origem_rastreavel: leadsComOrigem,
      percentual_rastreado: porcentagem(leadsComOrigem, input.leadsCriados.length),
      origens: montarOrigens(input.leadsCriados),
      captacoes_webhook: input.captacoes.length,
      captacoes_por_desfecho: top(
        contar(
          input.captacoes.map((c) => c.outcome),
          "sem desfecho",
        ),
      ),
    },
    funil: {
      fechados: ganhos + perdidos,
      ganhos,
      perdidos,
      taxa_ganho_fechados: taxaGanho,
      abertos_criados_no_periodo: input.leadsCriados.filter((l) => l.status === "open").length,
      perdidos_por_motivo: top(
        contar(
          input.leadsFechados.filter((l) => l.status === "lost").map((l) => l.lost_reason),
          SEM_MOTIVO,
        ),
      ),
    },
    atendimento: {
      conversas_ativas: input.conversas.length,
      aguardando_resposta: input.conversas.filter((c) => c.awaiting_since).length,
      handoffs: input.conversas.filter((c) => dentroDaJanela(c.last_handoff_at, input.janela))
        .length,
      mensagens_entrada: mensagensEntrada,
      mensagens_saida: mensagensSaida,
      saidas_por_autoria: top(
        contar(
          input.mensagens.filter((m) => m.direction === "outbound").map((m) => m.sent_via),
          "sem autoria",
        ),
      ),
      conversas_com_entrada: respostas.conversasComEntrada,
      conversas_sem_resposta_apos_entrada: respostas.conversasSemResposta,
      mediana_primeira_resposta_segundos: respostas.medianaPrimeiraResposta,
      mediana_primeira_resposta_humana_segundos: respostas.medianaPrimeiraRespostaHumana,
    },
    atividades: {
      total: input.atividades.length,
      por_ator: top(
        contar(
          input.atividades.map((a) => a.actor_kind),
          "sem ator",
        ),
      ),
      por_tipo: top(
        contar(
          input.atividades.map((a) => a.type),
          "sem tipo",
        ),
      ),
    },
    ia: {
      chamadas: input.chamadasIa.length,
      erros: input.chamadasIa.filter((c) => c.status === "erro").length,
      custo_cents: input.chamadasIa.reduce((acc, c) => acc + (c.cost_cents ?? 0), 0),
      custo_analise_cents: custoAnalise,
      latencia_p50_ms: mediana(chamadasComLatencia),
      por_finalidade: top(
        [...porFinalidade.values()].sort(
          (a, b) => b.quantidade - a.quantidade || a.chave.localeCompare(b.chave, "pt-BR"),
        ),
      ),
    },
    diagnostico: {
      foco,
      titulo:
        foco === "dados_insuficientes"
          ? "Ainda falta volume para cravar o gargalo"
          : foco === "rastreio"
            ? "Antes de discutir qualidade, falta rastrear melhor a origem"
            : foco === "comercial"
              ? "O maior sinal do período está na execução comercial"
              : foco === "operacao"
                ? "O gargalo parece estar no processo após a chegada do lead"
                : "A leitura aponta sinais mistos",
      resumo:
        "Diagnóstico objetivo com dados de origem, funil, atendimento, atividades e custo de IA, sem leitura semântica das mensagens.",
      sinais,
      proximos_passos: [
        "Conferir UTMs e links rastreáveis das campanhas ativas.",
        "Auditar conversas sem resposta posterior e leads perdidos por motivo.",
        "Separar amostra de atendimentos fechados para a futura análise semântica com IA.",
      ],
      nao_medido: [
        "Qualidade semântica do lead dentro do texto da conversa.",
        "Objeções, sentimento e aderência ao perfil ideal.",
        "Comparação automática com o período anterior.",
      ],
    },
  };
}

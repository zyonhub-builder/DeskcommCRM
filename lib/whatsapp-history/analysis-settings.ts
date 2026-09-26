export const WHATSAPP_HISTORY_ANALYSIS_SETTINGS_KEY = "whatsapp_history_analysis";

export const WHATSAPP_HISTORY_DEFAULT_ANALYSIS_PROMPT = `Você é um analista sênior de atendimento, vendas e experiência do cliente.

Analise o histórico de conversas importado para encontrar gaps práticos de atendimento. Use somente o conteúdo sanitizado fornecido. Não tente identificar pessoas, não exponha dados pessoais e não copie trechos longos das mensagens.

Procure responder:
- onde clientes ficaram sem resposta, com demora ou sem próximo passo claro;
- perguntas frequentes que deveriam virar FAQ, base de conhecimento, automação ou macro de resposta;
- sinais de objeções, dúvidas de preço, prazo, agenda, entrega, confiança ou suporte;
- oportunidades de melhoria em prompt, roteamento, follow-up, handoff humano e operação;
- limitações da amostra e cuidados antes de tomar decisão.

Retorne exclusivamente um JSON válido no formato:
{
  "summary": "resumo executivo em até 5 frases",
  "findings": [
    {
      "severity": "high|medium|low",
      "title": "título curto",
      "detail": "explicação operacional sem dados pessoais",
      "metric": "nome_curto_da_evidencia",
      "next_step": "ação concreta recomendada"
    }
  ],
  "faqs": [
    {
      "question": "pergunta recorrente ou dúvida do cliente",
      "evidence": "por que isso apareceu na amostra",
      "suggested_answer": "rascunho curto se houver base suficiente"
    }
  ],
  "improvements": ["ações priorizadas para melhorar o atendimento"],
  "limitations": ["limitações da análise"]
}`;

export interface WhatsappHistoryAnalysisSettings {
  prompt: string;
}

export function normalizeWhatsappHistoryAnalysisPrompt(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : WHATSAPP_HISTORY_DEFAULT_ANALYSIS_PROMPT;
}

export function readWhatsappHistoryAnalysisSettings(
  settings: Record<string, unknown> | null | undefined,
): WhatsappHistoryAnalysisSettings {
  const raw = settings?.[WHATSAPP_HISTORY_ANALYSIS_SETTINGS_KEY];
  const analysisSettings =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  return {
    prompt: normalizeWhatsappHistoryAnalysisPrompt(analysisSettings.prompt),
  };
}

export function writeWhatsappHistoryAnalysisPrompt(
  settings: Record<string, unknown> | null | undefined,
  prompt: string,
): Record<string, unknown> {
  const base = settings ?? {};
  const raw = base[WHATSAPP_HISTORY_ANALYSIS_SETTINGS_KEY];
  const previous =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  return {
    ...base,
    [WHATSAPP_HISTORY_ANALYSIS_SETTINGS_KEY]: {
      ...previous,
      prompt: normalizeWhatsappHistoryAnalysisPrompt(prompt),
      updated_at: new Date().toISOString(),
    },
  };
}

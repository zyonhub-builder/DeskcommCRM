import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import type { WhatsappHistoryReportFinding, WhatsappHistoryReportRow } from "./report";

const COLORS = {
  ink: "#172033",
  muted: "#667085",
  line: "#d9e2ec",
  panel: "#f6f8fb",
  panelStrong: "#e9f1ff",
  accent: "#2563eb",
  success: "#057a55",
  warning: "#b45309",
  danger: "#b42318",
  dangerBg: "#fff1f0",
  warningBg: "#fff7ed",
  successBg: "#ecfdf3",
};

const styles = StyleSheet.create({
  page: {
    padding: 34,
    paddingBottom: 50,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    backgroundColor: "#ffffff",
  },
  hero: {
    padding: 18,
    borderRadius: 8,
    backgroundColor: COLORS.panelStrong,
    border: `1pt solid ${COLORS.line}`,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 8,
    color: COLORS.accent,
    textTransform: "uppercase",
    letterSpacing: 0,
    marginBottom: 5,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  summary: {
    fontSize: 11,
    lineHeight: 1.45,
    color: COLORS.ink,
  },
  meta: {
    marginTop: 10,
    fontSize: 8,
    color: COLORS.muted,
  },
  section: {
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
  },
  sectionNote: {
    fontSize: 8,
    color: COLORS.muted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  statCard: {
    width: "33.333%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  statInner: {
    minHeight: 58,
    padding: 9,
    borderRadius: 6,
    border: `1pt solid ${COLORS.line}`,
    backgroundColor: COLORS.panel,
  },
  statLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 5,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  statHint: {
    marginTop: 4,
    fontSize: 7,
    color: COLORS.muted,
  },
  barBlock: {
    padding: 10,
    borderRadius: 6,
    border: `1pt solid ${COLORS.line}`,
    backgroundColor: "#ffffff",
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  barLabel: {
    width: 70,
    fontSize: 8,
    color: COLORS.muted,
  },
  barTrack: {
    width: 150,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#edf2f7",
  },
  barHigh: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
  },
  barMedium: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
  },
  barLow: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  barValue: {
    width: 28,
    textAlign: "right",
    fontSize: 8,
    color: COLORS.muted,
  },
  finding: {
    padding: 10,
    borderRadius: 6,
    border: `1pt solid ${COLORS.line}`,
    marginBottom: 7,
    backgroundColor: "#ffffff",
  },
  findingHigh: {
    borderColor: "#f3b4ae",
    backgroundColor: COLORS.dangerBg,
  },
  findingMedium: {
    borderColor: "#fed7aa",
    backgroundColor: COLORS.warningBg,
  },
  findingLow: {
    borderColor: "#bbf7d0",
    backgroundColor: COLORS.successBg,
  },
  findingTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 4,
  },
  findingMeta: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 5,
  },
  paragraph: {
    lineHeight: 1.35,
    marginBottom: 4,
  },
  nextStep: {
    marginTop: 5,
    padding: 6,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    fontSize: 8,
  },
  columns: {
    flexDirection: "row",
    marginHorizontal: -5,
  },
  column: {
    width: "50%",
    paddingHorizontal: 5,
  },
  noteCard: {
    padding: 9,
    borderRadius: 6,
    border: `1pt solid ${COLORS.line}`,
    marginBottom: 7,
    backgroundColor: "#ffffff",
  },
  noteTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  small: {
    fontSize: 8,
    color: COLORS.muted,
    lineHeight: 1.35,
  },
  footer: {
    position: "absolute",
    left: 34,
    right: 34,
    bottom: 22,
    paddingTop: 5,
    borderTop: `0.5pt solid ${COLORS.line}`,
    fontSize: 7,
    color: COLORS.muted,
  },
});

function metricNumber(report: WhatsappHistoryReportRow, key: string): number | null {
  const value = report.metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metricArray<T extends Record<string, unknown>>(
  report: WhatsappHistoryReportRow,
  key: string,
): T[] {
  const value = report.metrics[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso;
  }
}

function formatMinutes(value: number | null): string {
  if (value === null) return "-";
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function formatNumber(value: number | null): string {
  return value === null ? "-" : value.toLocaleString("pt-BR");
}

function severityLabel(severity: WhatsappHistoryReportFinding["severity"]): string {
  if (severity === "high") return "Alta";
  if (severity === "medium") return "Média";
  return "Baixa";
}

function severityStyle(severity: WhatsappHistoryReportFinding["severity"]) {
  if (severity === "high") return styles.findingHigh;
  if (severity === "medium") return styles.findingMedium;
  return styles.findingLow;
}

function methodLabel(report: WhatsappHistoryReportRow): string {
  if (report.metrics.ai_used === true) return "IA + métricas operacionais";
  const method = report.metrics.analysis_method;
  return typeof method === "string" ? method : "métricas operacionais";
}

function StatCard(props: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statInner}>
        <Text style={styles.statLabel}>{props.label}</Text>
        <Text style={styles.statValue}>{props.value}</Text>
        {props.hint ? <Text style={styles.statHint}>{props.hint}</Text> : null}
      </View>
    </View>
  );
}

function SeverityBars({ findings }: { findings: WhatsappHistoryReportFinding[] }) {
  const counts = {
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
  };
  const total = Math.max(1, findings.length);
  const rows = [
    { label: "Alta", value: counts.high, style: styles.barHigh },
    { label: "Média", value: counts.medium, style: styles.barMedium },
    { label: "Baixa", value: counts.low, style: styles.barLow },
  ];

  return (
    <View style={styles.barBlock}>
      {rows.map((row) => (
        <View key={row.label} style={styles.barRow}>
          <Text style={styles.barLabel}>{row.label}</Text>
          <View style={styles.barTrack}>
            <View style={[row.style, { width: Math.round((row.value / total) * 150) }]} />
          </View>
          <Text style={styles.barValue}>{row.value}</Text>
        </View>
      ))}
      <Text style={styles.small}>Distribuição dos achados por severidade.</Text>
    </View>
  );
}

function FaqCard(props: {
  faq: { question?: unknown; evidence?: unknown; suggested_answer?: unknown };
}) {
  return (
    <View style={styles.noteCard}>
      <Text style={styles.noteTitle}>{String(props.faq.question ?? "Pergunta recorrente")}</Text>
      <Text style={styles.small}>{String(props.faq.evidence ?? "Evidência não informada.")}</Text>
      {typeof props.faq.suggested_answer === "string" &&
      props.faq.suggested_answer.trim().length > 0 ? (
        <Text style={[styles.paragraph, { marginTop: 5 }]}>
          Resposta sugerida: {props.faq.suggested_answer}
        </Text>
      ) : null}
    </View>
  );
}

export function WhatsappHistoryReportPdf({
  report,
  importId,
}: {
  report: WhatsappHistoryReportRow;
  importId?: string;
}): React.ReactElement {
  const faqs = metricArray<{
    question?: unknown;
    evidence?: unknown;
    suggested_answer?: unknown;
  }>(report, "ai_faqs");
  const improvements = stringArray(report.metrics.ai_improvements);
  const generatedAt = formatDate(report.generated_at);
  const aiUsed = report.metrics.ai_used === true;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Análise de atendimentos</Text>
          <Text style={styles.title}>Relatório de análise de conversas</Text>
          <Text style={styles.summary}>{report.summary}</Text>
          <Text style={styles.meta}>
            Gerado em {generatedAt} · Método: {methodLabel(report)}
            {importId ? ` · Importação ${importId.slice(0, 8)}` : ""}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Painel rapido</Text>
            <Text style={styles.sectionNote}>
              Números agregados do histórico importado, sem corpo bruto de conversa
            </Text>
          </View>
          <View style={styles.grid}>
            <StatCard
              label="Conversas sem resposta"
              value={formatNumber(metricNumber(report, "unanswered_chats"))}
              hint="Cliente falou; atendimento não respondeu na amostra."
            />
            <StatCard
              label="Sem saída do atendimento"
              value={formatNumber(metricNumber(report, "chats_without_outbound"))}
              hint="Conversas sem mensagem outbound registrada."
            />
            <StatCard
              label="Primeira resposta"
              value={formatMinutes(metricNumber(report, "median_first_response_minutes"))}
              hint="Mediana em conversas com resposta."
            />
            <StatCard
              label="Fora do horário"
              value={`${formatNumber(metricNumber(report, "inbound_outside_business_hours_percent"))}%`}
              hint="Entradas fora da janela operacional usada pela regra."
            />
            {aiUsed ? (
              <>
                <StatCard
                  label="Mensagens lidas pela IA"
                  value={formatNumber(metricNumber(report, "ai_messages_sampled"))}
                  hint="Amostra textual sanitizada."
                />
                <StatCard
                  label="Conversas na amostra"
                  value={formatNumber(metricNumber(report, "ai_chats_sampled"))}
                  hint="Base do diagnóstico qualitativo."
                />
              </>
            ) : (
              <StatCard
                label="Achados"
                value={formatNumber(report.findings.length)}
                hint="Gerados por regras e métricas."
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Prioridade dos achados</Text>
            <Text style={styles.sectionNote}>Onde atacar primeiro</Text>
          </View>
          <SeverityBars findings={report.findings} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Gaps e oportunidades</Text>
            <Text style={styles.sectionNote}>Achado → impacto → próximo passo</Text>
          </View>
          {report.findings.length > 0 ? (
            report.findings.map((finding) => (
              <View
                key={`${finding.metric}:${finding.title}`}
                style={[styles.finding, severityStyle(finding.severity)]}
              >
                <Text style={styles.findingTitle}>{finding.title}</Text>
                <Text style={styles.findingMeta}>
                  Severidade {severityLabel(finding.severity)} · Métrica {finding.metric}
                </Text>
                <Text style={styles.paragraph}>{finding.detail}</Text>
                <Text style={styles.nextStep}>Próximo passo: {finding.next_step}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.small}>Nenhum achado registrado.</Text>
          )}
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Perguntas recorrentes</Text>
              {faqs.length > 0 ? (
                faqs
                  .slice(0, 8)
                  .map((faq, index) => (
                    <FaqCard key={`${String(faq.question ?? "faq")}:${index}`} faq={faq} />
                  ))
              ) : (
                <Text style={styles.small}>Nenhuma FAQ recorrente registrada.</Text>
              )}
            </View>
          </View>
          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Melhorias recomendadas</Text>
              {improvements.length > 0 ? (
                improvements.slice(0, 10).map((improvement, index) => (
                  <View key={`${improvement}:${index}`} style={styles.noteCard}>
                    <Text style={styles.paragraph}>{improvement}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.small}>Nenhuma melhoria registrada.</Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Limites da análise</Text>
              {report.limitations.length > 0 ? (
                report.limitations.map((limitation, index) => (
                  <Text key={`${limitation}:${index}`} style={styles.small}>
                    - {limitation}
                  </Text>
                ))
              ) : (
                <Text style={styles.small}>Nenhuma limitação registrada.</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            Relatório operacional para melhoria de atendimento. O PDF resume métricas e diagnóstico;
            mensagens completas ficam no XLSX completo da importação.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderWhatsappHistoryReportPdf(
  report: WhatsappHistoryReportRow,
  input: { importId?: string } = {},
): Promise<Buffer> {
  const element = <WhatsappHistoryReportPdf report={report} importId={input.importId} />;
  const buf = await renderToBuffer(element);
  return buf as Buffer;
}

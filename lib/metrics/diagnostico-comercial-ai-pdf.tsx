import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { tagDeIdioma } from "@/lib/i18n/datas";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";

import type { AnaliseIaDiagnosticoComercialPayload } from "./diagnostico-comercial-ai";

const COLORS = {
  ink: "#172033",
  muted: "#667085",
  line: "#d9e2ec",
  panel: "#f6f8fb",
  accent: "#2563eb",
  danger: "#b42318",
  warning: "#b45309",
  neutral: "#475467",
};

const styles = StyleSheet.create({
  page: {
    padding: 34,
    paddingBottom: 48,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    backgroundColor: "#ffffff",
  },
  hero: {
    padding: 16,
    borderRadius: 8,
    border: `1pt solid ${COLORS.line}`,
    backgroundColor: COLORS.panel,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 8,
    color: COLORS.accent,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  summary: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  meta: {
    marginTop: 8,
    fontSize: 8,
    color: COLORS.muted,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 7,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  stat: {
    width: "25%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  statInner: {
    minHeight: 48,
    padding: 8,
    borderRadius: 6,
    border: `1pt solid ${COLORS.line}`,
  },
  statLabel: {
    fontSize: 7,
    color: COLORS.muted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  finding: {
    padding: 10,
    borderRadius: 6,
    border: `1pt solid ${COLORS.line}`,
    marginBottom: 7,
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
  listItem: {
    marginBottom: 4,
    lineHeight: 1.3,
  },
  columns: {
    flexDirection: "row",
  },
  column: {
    width: "50%",
  },
  columnLeft: {
    paddingRight: 6,
  },
  columnRight: {
    paddingLeft: 6,
  },
  footer: {
    position: "absolute",
    left: 34,
    right: 34,
    bottom: 24,
    fontSize: 7,
    color: COLORS.muted,
    borderTop: `1pt solid ${COLORS.line}`,
    paddingTop: 6,
  },
});

function moeda(cents: number | null): string {
  if (cents === null) return "preco indisponivel";
  return `US$ ${(cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function prioridade(prioridade: string): string {
  if (prioridade === "alta") return "Alta";
  if (prioridade === "media") return "Media";
  return "Baixa";
}

function dataCurta(iso: string | undefined): string {
  if (!iso) return "periodo nao informado";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString(tagDeIdioma(IDIOMA_PADRAO), { timeZone: "UTC" });
}

function lista(itens: readonly string[]) {
  return itens.map((item, index) => (
    <Text key={`${item}-${index}`} style={styles.listItem}>
      {index + 1}. {item}
    </Text>
  ));
}

export async function renderDiagnosticoComercialAnalisePdf(
  analise: AnaliseIaDiagnosticoComercialPayload,
  opts: { janela?: { from?: string; to?: string }; geradoEm?: Date } = {},
): Promise<Buffer> {
  const geradoEm = opts.geradoEm ?? new Date();
  const periodo =
    opts.janela?.from || opts.janela?.to
      ? `${dataCurta(opts.janela.from)} ate ${dataCurta(opts.janela.to)}`
      : "periodo da tela";

  return renderToBuffer(
    <Document
      title="Diagnostico comercial com IA"
      author="CRM"
      subject="Analise comercial gerada sob demanda"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Diagnostico comercial com IA</Text>
          <Text style={styles.title}>{analise.titulo}</Text>
          <Text style={styles.summary}>{analise.resumo}</Text>
          <Text style={styles.meta}>
            Periodo: {periodo} · Gerado em{" "}
            {geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.stat}>
            <View style={styles.statInner}>
              <Text style={styles.statLabel}>Custo desta analise</Text>
              <Text style={styles.statValue}>{moeda(analise.custo.cost_cents)}</Text>
            </View>
          </View>
          <View style={styles.stat}>
            <View style={styles.statInner}>
              <Text style={styles.statLabel}>Modelo</Text>
              <Text style={styles.statValue}>
                {analise.custo.provider}/{analise.custo.model}
              </Text>
            </View>
          </View>
          <View style={styles.stat}>
            <View style={styles.statInner}>
              <Text style={styles.statLabel}>Tokens</Text>
              <Text style={styles.statValue}>
                {analise.custo.input_tokens} in · {analise.custo.output_tokens} out
              </Text>
            </View>
          </View>
          <View style={styles.stat}>
            <View style={styles.statInner}>
              <Text style={styles.statLabel}>Latencia</Text>
              <Text style={styles.statValue}>
                {(analise.custo.latency_ms / 1000).toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
                s
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conclusao</Text>
          <Text style={styles.paragraph}>{analise.conclusao.justificativa}</Text>
          <Text style={styles.meta}>
            Eixo: {analise.conclusao.eixo_principal} · Confianca: {analise.conclusao.confianca}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Achados</Text>
          {analise.achados.map((achado, index) => (
            <View key={`${achado.titulo}-${index}`} style={styles.finding} wrap={false}>
              <Text style={styles.findingTitle}>{achado.titulo}</Text>
              <Text style={styles.findingMeta}>
                {prioridade(achado.prioridade)} · {achado.eixo}
              </Text>
              <Text style={styles.paragraph}>Evidencia: {achado.evidencia}</Text>
              <Text style={styles.paragraph}>{achado.interpretacao}</Text>
              <Text style={styles.paragraph}>Acao: {achado.acao}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.section, styles.columns]}>
          <View style={[styles.column, styles.columnLeft]}>
            <Text style={styles.sectionTitle}>Proximos passos</Text>
            {lista(analise.proximos_passos)}
          </View>
          <View style={[styles.column, styles.columnRight]}>
            <Text style={styles.sectionTitle}>Limites</Text>
            {lista(analise.limites)}
          </View>
        </View>

        <Text style={styles.footer}>
          Gerado a partir dos agregados do diagnostico comercial. O corpo das mensagens nao foi
          enviado para a IA nesta versao.
        </Text>
      </Page>
    </Document>,
  );
}

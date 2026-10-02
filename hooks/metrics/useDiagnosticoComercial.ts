"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { RelatorioAnaliseIaDiagnosticoComercial } from "@/lib/metrics/diagnostico-comercial-reports";
import type { DiagnosticoComercialPayload } from "@/lib/metrics/diagnostico-comercial";

const DIA_MS = 24 * 60 * 60 * 1000;

export function janelaDoDiagnosticoComercial(periodoDias: 7 | 30 | 90): {
  from: string;
  to: string;
} {
  const to = new Date();
  const from = new Date(to.getTime() - periodoDias * DIA_MS);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function useDiagnosticoComercial(periodoDias: 7 | 30 | 90) {
  return useQuery({
    queryKey: ["metrics", "diagnostico-comercial", periodoDias],
    queryFn: async () => {
      const qs = new URLSearchParams(janelaDoDiagnosticoComercial(periodoDias));
      return apiClient.get<{ data: DiagnosticoComercialPayload }>(
        `/api/v1/metrics/diagnostico-comercial?${qs.toString()}`,
      );
    },
    staleTime: 30_000,
  });
}

export function useRelatoriosDiagnosticoComercial() {
  return useQuery({
    queryKey: ["metrics", "diagnostico-comercial", "analises"],
    queryFn: async () =>
      apiClient.get<{ data: { relatorios: RelatorioAnaliseIaDiagnosticoComercial[] } }>(
        "/api/v1/metrics/diagnostico-comercial/analise?limit=10",
      ),
    staleTime: 30_000,
  });
}

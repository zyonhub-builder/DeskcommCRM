"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import type {
  AdminInstancesPayload,
  AdminInstanceSettings,
} from "@/app/api/v1/admin/instances/route";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";

const ADMIN_INSTANCES_KEY = ["admin", "instances"] as const;

interface AdminInstancesResponse {
  data: AdminInstancesPayload;
}

interface TestAlertResponse {
  data: {
    status: "sent" | "skipped" | "failed";
    reason: string | null;
    reason_label: string;
    recipientMask: string | null;
  };
}

export type AdminInstanceSettingsPatch = Omit<
  AdminInstanceSettings,
  "recipient_mask" | "updated_at"
>;

export function useAdminInstances() {
  return useQuery({
    queryKey: ADMIN_INSTANCES_KEY,
    queryFn: async () => {
      const res = await apiClient.get<AdminInstancesResponse>("/api/v1/admin/instances");
      return res.data;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useSaveAdminInstanceSettings() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationKey: [...ADMIN_INSTANCES_KEY, "save"],
    mutationFn: async (patch: AdminInstanceSettingsPatch) => {
      const res = await apiClient.patch<AdminInstancesResponse>("/api/v1/admin/instances", patch);
      return res.data;
    },
    onSuccess: (payload) => {
      qc.setQueryData(ADMIN_INSTANCES_KEY, payload);
      toast.success(t("Configuração salva."));
    },
    onError: (err) => showApiError(err),
  });
}

export function useSendAdminInstanceTestAlert() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationKey: [...ADMIN_INSTANCES_KEY, "test-alert"],
    mutationFn: async () => {
      const res = await apiClient.post<TestAlertResponse>("/api/v1/admin/instances/test-alert", {});
      return res.data;
    },
    onSuccess: (resultado) => {
      void qc.invalidateQueries({ queryKey: ADMIN_INSTANCES_KEY });
      if (resultado.status === "sent") {
        toast.success(t("Aviso de teste enviado."));
      } else {
        toast.warning(resultado.reason_label);
      }
    },
    onError: (err) => showApiError(err),
  });
}

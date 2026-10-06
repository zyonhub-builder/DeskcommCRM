"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { CreateTeamUserInput, Role } from "@/lib/schemas/team";

interface CreateTeamUserResult {
  data: {
    user_id: string;
    email: string;
    full_name: string | null;
    role: Role;
    membership_id: string;
  };
}

export function useCreateTeamUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTeamUserInput) =>
      apiClient.post<CreateTeamUserResult>("/api/v1/team/create-user", input),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });
}

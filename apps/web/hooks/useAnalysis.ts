"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useLatestAnalysis(storeId: string) {
  return useQuery({
    queryKey: ["analysis", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/analysis`);
      return data;
    },
    enabled: !!storeId,
    retry: false,
  });
}

export function useCompetitiveScore(storeId: string) {
  return useQuery({
    queryKey: ["analysis", storeId, "score"],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/stores/${storeId}/analysis/score`,
      );
      return data;
    },
    enabled: !!storeId,
    retry: false,
  });
}

export function useRunAnalysis(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/stores/${storeId}/analysis/run`,
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["analysis", storeId] }),
  });
}

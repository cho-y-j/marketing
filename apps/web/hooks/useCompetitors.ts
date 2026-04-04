"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useCompetitors(storeId: string) {
  return useQuery({
    queryKey: ["competitors", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/competitors`);
      return data;
    },
    enabled: !!storeId,
    retry: false,
  });
}

export function useCompetitorComparison(storeId: string) {
  return useQuery({
    queryKey: ["competitors", storeId, "compare"],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/competitors/compare`);
      return data;
    },
    enabled: !!storeId,
    retry: false,
  });
}

export function useAddCompetitor(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { competitorName: string; category?: string }) => {
      const { data } = await apiClient.post(`/stores/${storeId}/competitors`, dto);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitors", storeId] }),
  });
}

export function useDeleteCompetitor(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (competitorId: string) => {
      await apiClient.delete(`/stores/${storeId}/competitors/${competitorId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitors", storeId] }),
  });
}

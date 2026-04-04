"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useRankHistory(storeId: string, days = 7, keyword?: string) {
  return useQuery({
    queryKey: ["rankHistory", storeId, days, keyword],
    queryFn: async () => {
      const params: any = { days };
      if (keyword) params.keyword = keyword;
      const { data } = await apiClient.get(
        `/stores/${storeId}/keywords/rank-history`,
        { params },
      );
      return data;
    },
    enabled: !!storeId,
    retry: false,
  });
}

export function useRankCheck(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/stores/${storeId}/keywords/rank-check`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rankHistory", storeId] });
      qc.invalidateQueries({ queryKey: ["keywords", storeId] });
    },
  });
}

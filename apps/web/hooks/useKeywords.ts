"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useKeywords(storeId: string) {
  return useQuery({
    queryKey: ["keywords", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/keywords`);
      return data;
    },
    enabled: !!storeId,
  });
}

export function useKeywordTrends(storeId: string) {
  return useQuery({
    queryKey: ["keywords", storeId, "trends"],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/stores/${storeId}/keywords/trends`,
      );
      return data;
    },
    enabled: !!storeId,
  });
}

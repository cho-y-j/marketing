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

export function useKeywordDiscovery(storeId: string) {
  return useQuery({
    queryKey: ["keywords", storeId, "discover"],
    queryFn: async () => {
      const { data } = await apiClient.post(`/stores/${storeId}/keywords/discover`);
      return data;
    },
    enabled: false, // 수동 실행만
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

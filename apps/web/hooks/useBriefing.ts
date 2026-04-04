"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useTodayBriefing(storeId: string) {
  return useQuery({
    queryKey: ["briefing", storeId, "today"],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/stores/${storeId}/briefing/today`,
      );
      return data;
    },
    enabled: !!storeId,
    retry: false,
  });
}

export function useGenerateBriefing(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/stores/${storeId}/briefing/generate`,
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["briefing", storeId],
      }),
  });
}

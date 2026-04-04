"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useContents(storeId: string) {
  return useQuery({
    queryKey: ["content", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/content`);
      return data;
    },
    enabled: !!storeId,
    retry: false,
  });
}

export function useGenerateContent(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: {
      type: string;
      instruction?: string;
      targetKeywords?: string[];
    }) => {
      const { data } = await apiClient.post(`/stores/${storeId}/content/generate`, dto);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content", storeId] }),
  });
}

export function useDeleteContent(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contentId: string) => {
      await apiClient.delete(`/stores/${storeId}/content/${contentId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content", storeId] }),
  });
}

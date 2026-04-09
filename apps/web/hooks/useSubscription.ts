"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface SubscriptionInfo {
  subscriptionPlan: "FREE" | "BASIC" | "PREMIUM";
  subscriptionEndAt: string | null;
  anthropicApiKeyMasked: string | null;
  hasApiKey: boolean;
}

export function useSubscription() {
  return useQuery<SubscriptionInfo>({
    queryKey: ["subscription"],
    queryFn: async () => {
      const { data } = await apiClient.get(`/subscription`);
      return data;
    },
  });
}

export function useRegisterApiKey() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean; maskedKey: string }, any, { apiKey: string }>({
    mutationFn: async ({ apiKey }) => {
      const { data } = await apiClient.post(`/subscription/api-key`, { apiKey });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription"] }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, any, void>({
    mutationFn: async () => {
      const { data } = await apiClient.delete(`/subscription/api-key`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription"] }),
  });
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useStores() {
  return useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get("/stores");
        return data;
      } catch (e: any) {
        // 인증 안 된 상태면 빈 배열 (온보딩으로 유도)
        if (e.response?.status === 401) return [];
        throw e;
      }
    },
    retry: false,
  });
}

export function useStore(id: string) {
  return useQuery({
    queryKey: ["store", id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${id}`);
      return data;
    },
    enabled: !!id,
    retry: false,
  });
}

export function useCreateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: {
      name: string;
      naverPlaceUrl?: string;
      category?: string;
      district?: string;
    }) => {
      const { data } = await apiClient.post("/stores", dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stores"] }),
  });
}

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
      subCategory?: string;
      address?: string;
      district?: string;
      customKeywords?: string[];
      customCompetitorNames?: string[];
    }) => {
      const { data } = await apiClient.post("/stores", dto);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stores"] }),
  });
}

// 매장 삭제 — 관계 레코드(키워드/경쟁사/분석/스냅샷 등) 전부 cascade + 트랜잭션
export function useDeleteStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (storeId: string) => {
      const { data } = await apiClient.delete(`/stores/${storeId}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stores"] }),
  });
}

// 셋업 진행 상태 조회 (폴링용)
export function useSetupStatus(storeId: string) {
  return useQuery({
    queryKey: ["setup-status", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/setup-status`);
      return data as {
        status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
        step: string | null;
        error: string | null;
        completedAt: string | null;
        keywordCount: number;
        competitorCount: number;
      };
    },
    enabled: !!storeId,
    // RUNNING 상태면 2초마다 폴링, 완료/실패면 중지
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "RUNNING" || status === "PENDING") return 2000;
      return false;
    },
  });
}

// 셋업 재시도
export function useRetrySetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (storeId: string) => {
      const { data } = await apiClient.post(`/stores/${storeId}/setup`);
      return data;
    },
    onSuccess: (_data, storeId) => {
      queryClient.invalidateQueries({ queryKey: ["setup-status", storeId] });
    },
  });
}

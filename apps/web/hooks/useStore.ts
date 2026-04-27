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
    // 폴링 유지 조건:
    //  - 명시적 RUNNING/PENDING
    //  - COMPLETED 인데 키워드/경쟁사 데이터가 아직 비어있음 (백그라운드 진행 중)
    //  - setupStep 에 "진행 중"/"분석 중"/"수집 중"/"추가 분석" 표현 — 백엔드 실시간 갱신
    // 폴링 중지:
    //  - FAILED
    //  - setupStep 에 "완료 —" 마커가 들어왔을 때 (전체 셋업 완료 시그널)
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      if (data.status === "FAILED") return false;
      if (data.status === "RUNNING" || data.status === "PENDING") return 2000;
      // 셋업 완료 마커 — 백엔드가 모든 백그라운드 끝나고 set
      if (data.step?.startsWith("완료 —")) return false;
      // COMPLETED 라도 데이터 비어있거나 진행 표현 있으면 폴링
      if (data.keywordCount === 0 || data.competitorCount === 0) return 2000;
      if (data.step && /(진행 중|분석 중|수집 중|추가 분석)/.test(data.step)) return 2000;
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

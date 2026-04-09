"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// ROI 대시보드
export function useROI(storeId: string) {
  return useQuery({
    queryKey: ["roi", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/analysis/roi`);
      return data as {
        avgOrderValue: number;
        additionalExposure: number;
        additionalVisitors: number;
        additionalRevenue: number;
        monthlyFee: number;
        roi: number;
        roiText: string;
      };
    },
    enabled: !!storeId,
  });
}

// 등급 + 벤치마크
export function useGrade(storeId: string) {
  return useQuery({
    queryKey: ["grade", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/analysis/grade`);
      return data as {
        grade: "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";
        actionRate: number;
        improved: number;
        replyRate: number;
      };
    },
    enabled: !!storeId,
  });
}

export function useBenchmark(storeId: string) {
  return useQuery({
    queryKey: ["benchmark", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/analysis/benchmark`);
      return data as {
        grade: string;
        score: number | null;
        rankInArea: number;
        totalInArea: number;
        avgScore: number;
        percentile: number;
      };
    },
    enabled: !!storeId,
  });
}

// 주간 액션 성과
export function useWeeklyActions(storeId: string) {
  return useQuery({
    queryKey: ["weekly-actions", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/analysis/actions/weekly`);
      return data as {
        totalActions: number;
        measuredActions: number;
        improvedActions: number;
        actions: Array<{
          type: string;
          description: string;
          executedAt: string;
          effectSummary: string | null;
        }>;
      };
    },
    enabled: !!storeId,
  });
}

// 경쟁사 알림
export function useCompetitorAlerts(storeId: string) {
  return useQuery({
    queryKey: ["competitor-alerts", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/competitors/alerts`);
      return data as Array<{
        id: string;
        competitorName: string;
        alertType: string;
        detail: string;
        aiRecommendation: string | null;
        isRead: boolean;
        createdAt: string;
      }>;
    },
    enabled: !!storeId,
  });
}

// 자동화 설정
export function useAutoSettings(storeId: string) {
  return useQuery({
    queryKey: ["auto-settings", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/actions/settings`);
      return data as {
        autoReviewReply: boolean;
        autoContentPublish: boolean;
        contentPublishPerWeek: number;
        autoSeasonalKeyword: boolean;
        autoHiddenKeyword: boolean;
      };
    },
    enabled: !!storeId,
  });
}

export function useUpdateAutoSettings(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<{
      autoReviewReply: boolean;
      autoContentPublish: boolean;
      contentPublishPerWeek: number;
      autoSeasonalKeyword: boolean;
      autoHiddenKeyword: boolean;
    }>) => {
      const { data } = await apiClient.put(`/stores/${storeId}/actions/settings`, settings);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto-settings", storeId] }),
  });
}

// 대기 액션
export function usePendingActions(storeId: string) {
  return useQuery({
    queryKey: ["pending-actions", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/actions/pending`);
      return data as Array<{
        id: string;
        actionType: string;
        title: string;
        description: string;
        status: string;
        createdAt: string;
      }>;
    },
    enabled: !!storeId,
  });
}

export function useApproveAction(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const { data } = await apiClient.post(`/stores/${storeId}/actions/${actionId}/approve`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-actions", storeId] });
      qc.invalidateQueries({ queryKey: ["weekly-actions", storeId] });
    },
  });
}

export function useRejectAction(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const { data } = await apiClient.post(`/stores/${storeId}/actions/${actionId}/reject`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-actions", storeId] }),
  });
}

// 객단가 업데이트
export function useUpdateAvgOrderValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, avgOrderValue }: { storeId: string; avgOrderValue: number }) => {
      const { data } = await apiClient.put(`/stores/${storeId}`, { avgOrderValue });
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["roi", vars.storeId] }),
  });
}

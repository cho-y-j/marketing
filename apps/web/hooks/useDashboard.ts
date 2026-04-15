"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useDashboard(storeId: string) {
  return useQuery({
    queryKey: ["dashboard", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/dashboard/${storeId}`);
      return data as {
        store: {
          name: string;
          category: string | null;
          address: string | null;
          competitiveScore: number | null;
        };
        status: {
          level: "HIGH" | "MEDIUM" | "LOW";
          avgRank: number | null;
          totalKeywords: number;
          totalCompetitors: number;
          myReviews: number;
          avgCompetitorReviews: number;
        };
        problems: Array<{
          type: string;
          title: string;
          description: string;
          severity: "critical" | "warning" | "info";
          metric?: { current: number; target: number; unit: string };
        }>;
        actions: Array<{
          type: string;
          title: string;
          description: string;
          href: string;
        }>;
        aiPending?: boolean;
        keywordRanks: Array<{
          keyword: string;
          currentRank: number | null;
          previousRank: number | null;
          change: number | null;
          monthlyVolume: number | null;
          type: string;
        }>;
        competitorComparison: Array<{
          name: string;
          receiptReviewCount: number;
          blogReviewCount: number;
          dailySearchVolume: number;
          type: string;
        }>;
        myMetrics: {
          receiptReviewCount: number | null;
          blogReviewCount: number | null;
          dailySearchVolume: number | null;
          saveCount: number | null;
          trafficScore: number | null;
          engagementScore: number | null;
          satisfactionScore: number | null;
        } | null;
      };
    },
    enabled: !!storeId,
    // AI 보강 진행 중이면 8초마다 재조회 (캐시 채워지면 즉시 반영) — 아니면 60초
    refetchInterval: (query) =>
      (query.state.data as any)?.aiPending ? 8000 : 60000,
  });
}

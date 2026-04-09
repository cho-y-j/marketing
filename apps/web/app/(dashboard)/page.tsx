"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TodayBriefingCard } from "@/components/dashboard/today-briefing-card";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { AiActionsCard } from "@/components/dashboard/ai-actions-card";
import { CompetitorSummary } from "@/components/dashboard/competitor-summary";
import { KeywordTrendChart } from "@/components/dashboard/keyword-trend-chart";
import { RankHistoryChart } from "@/components/charts/rank-history-chart";
import { EmptyState } from "@/components/common/empty-state";
import { SetupProgressCard } from "@/components/dashboard/setup-progress-card";
import { GradeBenchmarkCard } from "@/components/dashboard/grade-benchmark-card";
import { ROICard } from "@/components/dashboard/roi-card";
import { CompetitorAlertCard } from "@/components/dashboard/competitor-alert-card";
import { WeeklyPerformanceCard } from "@/components/dashboard/weekly-performance-card";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useStore, useCreateStore } from "@/hooks/useStore";
import { useTodayBriefing, useGenerateBriefing } from "@/hooks/useBriefing";
import { useLatestAnalysis, useRunAnalysis } from "@/hooks/useAnalysis";
import { useKeywords } from "@/hooks/useKeywords";
import { useCompetitors } from "@/hooks/useCompetitors";
import { useRankHistory } from "@/hooks/useRankHistory";
import { toast } from "sonner";
import {
  BarChart3,
  Search,
  Sparkles,
  Users,
  MessageSquare,
  Loader2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useEffect } from "react";

/**
 * 메인 대시보드.
 * 기획서 8.1 "5대 영역":
 *   1. 매장 경쟁력 점수 (요약 수치 바)
 *   2. 오늘 장사 브리핑 (TodayBriefingCard)
 *   3. 경쟁 매장 비교 요약 (CompetitorSummary)
 *   4. 키워드 트렌드 요약 (KeywordTrendChart)
 *   5. 최근 AI 추천 액션 (AiActionsCard — 분석 recommendations)
 */
export default function DashboardPage() {
  const router = useRouter();
  const {
    storeId,
    stores,
    isLoading: storesLoading,
    hasStores,
    hasToken,
  } = useCurrentStoreId();
  const { data: store } = useStore(storeId);
  const { data: briefing } = useTodayBriefing(storeId);
  const { data: analysis, isLoading: analysisLoading } = useLatestAnalysis(storeId);
  const runAnalysis = useRunAnalysis(storeId);
  const generateBriefing = useGenerateBriefing(storeId);
  const createStore = useCreateStore();
  const { data: keywords } = useKeywords(storeId);
  const { data: competitors } = useCompetitors(storeId);
  const { data: rankData } = useRankHistory(storeId, 7);

  useEffect(() => {
    if (!hasToken) router.push("/login");
  }, [hasToken, router]);

  if (!hasToken) return null;

  if (storesLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-12 w-2/3 rounded-xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!hasStores) {
    return (
      <OnboardingCard
        onSubmit={(d) =>
          createStore.mutate(d, {
            onSuccess: (data: any) => {
              toast.success("매장이 등록되었습니다! AI 분석을 시작합니다.");
              router.push(
                `/stores/setup?id=${data.id}&name=${encodeURIComponent(data.name)}`,
              );
            },
            onError: (e: any) =>
              toast.error(
                e.response?.data?.message || "매장 등록에 실패했습니다",
              ),
          })
        }
        isLoading={createStore.isPending}
      />
    );
  }

  // 데이터 정리
  const score = store?.competitiveScore ?? analysis?.competitiveScore ?? 0;
  const kwList = keywords ?? [];
  const compList = competitors ?? [];
  const aiRecs: any[] =
    (analysis?.recommendations as any[]) ??
    (analysis?.aiAnalysis as any)?.recommendations ??
    [];

  // 점수 색상
  const scoreColor =
    score >= 71
      ? "text-emerald-500"
      : score >= 41
        ? "text-amber-500"
        : "text-rose-500";
  const scoreBg =
    score >= 71
      ? "from-emerald-500/10 to-emerald-500/5"
      : score >= 41
        ? "from-amber-500/10 to-amber-500/5"
        : "from-rose-500/10 to-rose-500/5";

  // 키워드 통계
  const upCount = kwList.filter((k: any) => k.trendDirection === "UP").length;
  const downCount = kwList.filter(
    (k: any) => k.trendDirection === "DOWN",
  ).length;

  // 순위 잡힌 키워드 우선 차트
  const ranked = kwList.filter((k: any) => k.currentRank != null);
  const unranked = kwList.filter((k: any) => k.currentRank == null);
  const chartKeywords = [...ranked, ...unranked]
    .slice(0, 5)
    .map((k: any) => k.keyword);

  // AI 분석 실행 핸들러
  const handleRunAnalysis = () => {
    toast.info("AI 분석을 시작합니다...");
    runAnalysis.mutate(undefined, {
      onSuccess: () => toast.success("AI 분석 완료!"),
      onError: (e: any) =>
        toast.error(
          "분석 실패: " + (e.response?.data?.message || e.message),
        ),
    });
  };

  return (
    <div className="space-y-5 md:space-y-6 max-w-5xl mx-auto">
      {/* === 영역 0: 환영 헤더 === */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">
          {store?.name ? `${store.name}` : "대시보드"}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {store?.address || "AI가 매장 마케팅을 분석하고 있습니다"}
        </p>
      </div>

      {/* === 셋업 진행 상태 (RUNNING/FAILED 시 표시) === */}
      {storeId && <SetupProgressCard storeId={storeId} />}

      {/* === "분석 중" 배너 (분석 데이터 없을 때만) === */}
      {storeId && !analysis && !analysisLoading && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/50">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-900">
              아직 AI 분석이 실행되지 않았습니다
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              첫 분석을 실행하면 경쟁력 점수, AI 추천, 키워드 트렌드가 모두
              표시됩니다
            </p>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={runAnalysis.isPending}
            className="shrink-0 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-md disabled:opacity-50"
          >
            {runAnalysis.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              "분석 실행"
            )}
          </button>
        </div>
      )}

      {/* === 영역 1: 등급 + 경쟁력 점수 + 벤치마크 (핵심 1초 영역) === */}
      {storeId && <GradeBenchmarkCard storeId={storeId} score={score} />}

      {/* === 영역 2: 오늘 장사 브리핑 (핵심 3초 영역) === */}
      <TodayBriefingCard
        briefing={briefing ?? null}
        isLoading={generateBriefing.isPending}
        onGenerate={() =>
          generateBriefing.mutate(undefined, {
            onSuccess: () => toast.success("브리핑이 생성되었습니다!"),
            onError: (e: any) =>
              toast.error(
                e.response?.data?.message || "브리핑 생성에 실패했습니다",
              ),
          })
        }
      />

      {/* === 영역 3: 경쟁사 알림 (있을 때만) === */}
      {storeId && <CompetitorAlertCard storeId={storeId} />}

      {/* === 영역 4: ROI + 주간 성과 (2열) === */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {storeId && <ROICard storeId={storeId} />}
        {storeId && <WeeklyPerformanceCard storeId={storeId} />}
      </div>

      {/* === 영역 5: 요약 수치 (4열 미니 카드) === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <div className="flex items-center justify-between mb-1">
              <Search size={14} className="text-blue-500" />
            </div>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-extrabold">{kwList.length}</span>
              <span className="text-xs text-muted-foreground mb-0.5">개</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              추적 키워드
              {(upCount > 0 || downCount > 0) && (
                <span className="ml-1.5">
                  {upCount > 0 && (
                    <span className="text-emerald-500 font-medium">
                      <TrendingUp size={9} className="inline" />
                      {upCount}
                    </span>
                  )}
                  {downCount > 0 && (
                    <span className="text-rose-500 font-medium ml-1">
                      <TrendingDown size={9} className="inline" />
                      {downCount}
                    </span>
                  )}
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-rose-500/10 to-rose-500/5">
            <div className="flex items-center justify-between mb-1">
              <Users size={14} className="text-rose-500" />
            </div>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-extrabold">{compList.length}</span>
              <span className="text-xs text-muted-foreground mb-0.5">개</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">경쟁 매장</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-violet-500/10 to-violet-500/5">
            <div className="flex items-center justify-between mb-1">
              <MessageSquare size={14} className="text-violet-500" />
            </div>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-extrabold">
                {analysis?.receiptReviewCount ?? "-"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              방문자 리뷰
              {analysis?.blogReviewCount != null && (
                <span className="ml-1">
                  / 블로그 {analysis.blogReviewCount}
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-amber-500/10 to-amber-500/5">
            <div className="flex items-center justify-between mb-1">
              <BarChart3 size={14} className="text-amber-500" />
            </div>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-extrabold">
                {analysis?.dailySearchVolume ?? "-"}
              </span>
              <span className="text-xs text-muted-foreground mb-0.5">/일</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">일 검색량</p>
          </CardContent>
        </Card>
      </div>

      {/* === 영역 6: 경쟁 현황 + 키워드 트렌드 (2열) === */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CompetitorSummary competitors={compList} />
        <KeywordTrendChart keywords={kwList} />
      </div>

      {/* === 영역 7: AI 추천 액션 === */}
      <AiActionsCard
        recommendations={aiRecs}
        isLoading={analysisLoading}
        onRunAnalysis={handleRunAnalysis}
        analysisRunning={runAnalysis.isPending}
      />

      {/* === 영역 8: 순위 변동 차트 === */}
      {chartKeywords.length > 0 && (
        <RankHistoryChart
          data={rankData ?? []}
          keywords={chartKeywords}
          isLoading={false}
        />
      )}
    </div>
  );
}

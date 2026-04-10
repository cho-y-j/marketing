"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { TodayBriefingCard } from "@/components/dashboard/today-briefing-card";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { AiActionsCard } from "@/components/dashboard/ai-actions-card";
import { CompetitorSummary } from "@/components/dashboard/competitor-summary";
import { KeywordTrendChart } from "@/components/dashboard/keyword-trend-chart";
import { RankHistoryChart } from "@/components/charts/rank-history-chart";
import { SetupProgressCard } from "@/components/dashboard/setup-progress-card";
import { GradeBenchmarkCard } from "@/components/dashboard/grade-benchmark-card";
import { ROICard } from "@/components/dashboard/roi-card";
import { CompetitorAlertCard } from "@/components/dashboard/competitor-alert-card";
import { WeeklyPerformanceCard } from "@/components/dashboard/weekly-performance-card";
import { AiActivityBanner } from "@/components/dashboard/ai-activity-banner";
import { AiWorkSummary } from "@/components/dashboard/ai-work-summary";
import { StatCard } from "@/components/common/stat-card";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useStore, useCreateStore } from "@/hooks/useStore";
import { useTodayBriefing, useGenerateBriefing } from "@/hooks/useBriefing";
import { useLatestAnalysis, useRunAnalysis } from "@/hooks/useAnalysis";
import { useKeywords } from "@/hooks/useKeywords";
import { useCompetitors } from "@/hooks/useCompetitors";
import { useRankHistory } from "@/hooks/useRankHistory";
import { toast } from "sonner";
import {
  Search,
  Sparkles,
  Swords,
  MessageSquareText,
  BarChart3,
  Loader2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  FileEdit,
  Zap,
} from "lucide-react";
import { useEffect } from "react";
import { formatNumber } from "@/lib/design-system";

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
  const { data: analysis, isLoading: analysisLoading } =
    useLatestAnalysis(storeId);
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
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
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

  const score = store?.competitiveScore ?? analysis?.competitiveScore ?? 0;
  const kwList = keywords ?? [];
  const compList = competitors ?? [];
  const aiRecs: any[] =
    (analysis?.recommendations as any[]) ??
    (analysis?.aiAnalysis as any)?.recommendations ??
    [];

  const upCount = kwList.filter((k: any) => k.trendDirection === "UP").length;
  const downCount = kwList.filter(
    (k: any) => k.trendDirection === "DOWN",
  ).length;

  const ranked = kwList.filter((k: any) => k.currentRank != null);
  const unranked = kwList.filter((k: any) => k.currentRank == null);
  const chartKeywords = [...ranked, ...unranked]
    .slice(0, 5)
    .map((k: any) => k.keyword);

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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 환영 헤더 */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">
          {store?.name || "대시보드"}
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">
          {store?.address || "AI가 매장 마케팅을 분석하고 있습니다"}
        </p>
      </div>

      {/* 셋업 진행 */}
      {storeId && <SetupProgressCard storeId={storeId} />}

      {/* 분석 미실행 배너 */}
      {storeId && !analysis && !analysisLoading && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-brand-subtle border border-brand/10">
          <div className="size-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-brand" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">
              아직 AI 분석이 실행되지 않았습니다
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              첫 분석을 실행하면 경쟁력 점수, AI 추천, 키워드 트렌드가 표시됩니다
            </p>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={runAnalysis.isPending}
            className="shrink-0 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            {runAnalysis.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              "분석 실행"
            )}
          </button>
        </div>
      )}

      {/* 등급 + 경쟁력 점수 + 벤치마크 */}
      {storeId && <GradeBenchmarkCard storeId={storeId} score={score} />}

      {/* AI 활동 배너 — 승인 대기, 리뷰 답글 대기, 콘텐츠 대기 */}
      {storeId && <AiActivityBanner storeId={storeId} />}

      {/* 오늘 장사 브리핑 */}
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

      {/* 경쟁사 알림 */}
      {storeId && <CompetitorAlertCard storeId={storeId} />}

      {/* ROI + 주간 성과 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {storeId && <ROICard storeId={storeId} />}
        {storeId && <WeeklyPerformanceCard storeId={storeId} />}
      </div>

      {/* AI가 해준 일 */}
      {storeId && <AiWorkSummary storeId={storeId} />}

      {/* 요약 수치 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Search}
          variant="brand"
          label="추적 키워드"
          value={kwList.length}
          unit="개"
          sub={
            (upCount > 0 || downCount > 0) && (
              <div className="flex items-center gap-2 text-[11px]">
                {upCount > 0 && (
                  <span className="text-success font-medium flex items-center gap-0.5">
                    <TrendingUp size={10} />
                    {upCount}
                  </span>
                )}
                {downCount > 0 && (
                  <span className="text-danger font-medium flex items-center gap-0.5">
                    <TrendingDown size={10} />
                    {downCount}
                  </span>
                )}
              </div>
            )
          }
        />
        <StatCard
          icon={Swords}
          variant="danger"
          label="경쟁 매장"
          value={compList.length}
          unit="개"
        />
        <StatCard
          icon={MessageSquareText}
          variant="info"
          label="방문자 리뷰"
          value={formatNumber(analysis?.receiptReviewCount ?? null) || "-"}
          sub={
            analysis?.blogReviewCount != null && (
              <p className="text-[11px] text-text-tertiary">
                블로그 {formatNumber(analysis.blogReviewCount)}
              </p>
            )
          }
        />
        <StatCard
          icon={BarChart3}
          variant="warning"
          label="일 검색량"
          value={formatNumber(analysis?.dailySearchVolume ?? null) || "-"}
          unit="/일"
        />
      </div>

      {/* 경쟁 현황 + 키워드 트렌드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CompetitorSummary competitors={compList} />
        <KeywordTrendChart keywords={kwList} />
      </div>

      {/* AI 추천 액션 */}
      <AiActionsCard
        recommendations={aiRecs}
        isLoading={analysisLoading}
        onRunAnalysis={handleRunAnalysis}
        analysisRunning={runAnalysis.isPending}
      />

      {/* 순위 변동 차트 */}
      {chartKeywords.length > 0 && (
        <RankHistoryChart
          data={rankData ?? []}
          keywords={chartKeywords}
          isLoading={false}
        />
      )}

      {/* AI 핵심 기능 바로가기 */}
      <div>
        <h3 className="text-sm font-semibold text-text-secondary mb-3">AI가 대신 해드려요</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              href: "/reviews",
              icon: MessageSquareText,
              label: "리뷰 AI 답글",
              desc: "새 리뷰 수집 → AI 초안 → 1탭 승인",
              variant: "info" as const,
            },
            {
              href: "/content",
              icon: FileEdit,
              label: "AI 콘텐츠 생성",
              desc: "블로그·SNS·플레이스 소식 자동 작성",
              variant: "success" as const,
            },
            {
              href: "/competitors",
              icon: Swords,
              label: "경쟁사 AI 감시",
              desc: "리뷰 급증·순위 역전 자동 감지 + 대응",
              variant: "danger" as const,
            },
            {
              href: "/analysis",
              icon: Sparkles,
              label: "AI 종합 분석",
              desc: "경쟁력 점수·강점·약점·추천 액션",
              variant: "warning" as const,
            },
          ].map((item) => {
            const variantColors = {
              brand: "bg-brand-subtle text-brand",
              success: "bg-success-light text-success",
              info: "bg-info-light text-info",
              warning: "bg-warning-light text-warning",
              danger: "bg-danger-light text-danger",
            };
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-border-primary bg-surface p-4 shadow-sm hover:shadow-md hover:border-brand/20 transition-all group"
              >
                <div
                  className={`size-10 rounded-xl ${variantColors[item.variant]} flex items-center justify-center mb-3`}
                >
                  <item.icon size={20} />
                </div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
                  {item.desc}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

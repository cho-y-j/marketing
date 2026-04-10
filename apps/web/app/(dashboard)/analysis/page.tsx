"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitiveScoreChart } from "@/components/charts/competitive-score-chart";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useLatestAnalysis, useRunAnalysis } from "@/hooks/useAnalysis";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { toast } from "sonner";
import { getScoreLevel, formatNumber } from "@/lib/design-system";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Loader2,
  BarChart3,
  MessageSquareText,
  Users,
  Search,
  Bookmark,
  Sparkles,
  Target,
  Layers,
  Award,
  Info,
} from "lucide-react";

// 분석 히스토리 훅
function useAnalysisHistory(storeId: string) {
  return useQuery({
    queryKey: ["analysis", storeId, "history"],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/stores/${storeId}/analysis/history`,
      );
      return data as Array<{
        id: string;
        competitiveScore: number;
        analyzedAt: string;
      }>;
    },
    enabled: !!storeId,
    retry: false,
  });
}

export default function AnalysisPage() {
  const { storeId } = useCurrentStoreId();
  const { data: analysis, isLoading } = useLatestAnalysis(storeId);
  const { data: historyData, isLoading: historyLoading } =
    useAnalysisHistory(storeId);
  const runAnalysis = useRunAnalysis(storeId);

  const handleRun = () => {
    toast.info("AI 분석을 시작합니다. 잠시 기다려주세요...");
    runAnalysis.mutate(undefined, {
      onSuccess: () => toast.success("AI 분석이 완료되었습니다!"),
      onError: (e: any) =>
        toast.error(
          "분석 실패: " + (e.response?.data?.message || e.message),
        ),
    });
  };

  const aiData = analysis?.aiAnalysis as any;
  const strengths: string[] =
    (analysis?.strengths as string[]) ?? aiData?.strengths ?? [];
  const weaknesses: string[] =
    (analysis?.weaknesses as string[]) ?? aiData?.weaknesses ?? [];
  const recommendations: any[] =
    (analysis?.recommendations as any[]) ?? aiData?.recommendations ?? [];
  const score = analysis?.competitiveScore ?? 0;
  const sl = getScoreLevel(score);

  // 차트 데이터: 히스토리가 있으면 히스토리 사용, 없으면 현재 분석 1개
  const chartData =
    historyData && historyData.length > 0
      ? historyData.map((h) => ({
          date: h.analyzedAt?.split("T")[0] ?? "",
          score: h.competitiveScore,
        }))
      : analysis
        ? [
            {
              date: analysis.analyzedAt?.split("T")[0] ?? "",
              score,
            },
          ]
        : [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            매장 분석
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            AI가 매장 상태를 종합 분석합니다
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleRun}
          disabled={runAnalysis.isPending}
          className="rounded-xl bg-brand hover:bg-brand-dark"
        >
          {runAnalysis.isPending ? (
            <Loader2 size={14} className="animate-spin mr-1.5" />
          ) : (
            <Sparkles size={14} className="mr-1.5" />
          )}
          AI 분석 실행
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : !analysis ? (
        <div className="rounded-2xl border border-border-primary bg-surface shadow-sm">
          <EmptyState
            icon={BarChart3}
            title="아직 분석 결과가 없습니다"
            description="AI가 매장의 온라인 마케팅 상태를 종합 분석합니다"
            ctaLabel="첫 분석 실행하기"
            onCta={handleRun}
            ctaLoading={runAnalysis.isPending}
            className="py-16"
          />
        </div>
      ) : (
        <>
          {/* 점수 + 지표 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* 경쟁력 점수 */}
            <div className="col-span-2 md:col-span-1 rounded-2xl border border-border-primary bg-surface shadow-sm p-4 flex flex-col items-center justify-center">
              <div
                className={`size-20 rounded-full border-4 flex items-center justify-center mb-2 ${sl.text === "text-score-good" ? "border-score-good" : sl.text === "text-score-mid" ? "border-score-mid" : "border-score-bad"}`}
              >
                <span className={`text-2xl font-black ${sl.text}`}>
                  {score}
                </span>
              </div>
              <p className="text-xs font-medium text-text-secondary">
                경쟁력 점수
              </p>
            </div>

            <StatCard
              icon={MessageSquareText}
              variant="info"
              label="영수증 리뷰"
              value={formatNumber(analysis.receiptReviewCount) || "-"}
            />
            <StatCard
              icon={Users}
              variant="brand"
              label="블로그 리뷰"
              value={formatNumber(analysis.blogReviewCount) || "-"}
            />
            <StatCard
              icon={Search}
              variant="success"
              label="일 검색량"
              value={formatNumber(analysis.dailySearchVolume) || "-"}
            />
            <StatCard
              icon={Bookmark}
              variant="warning"
              label="저장수"
              value={formatNumber(analysis.saveCount) || "-"}
            />
          </div>

          {/* N1/N2/N3 지수 */}
          <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center">
                  <Layers size={14} className="text-brand" />
                </div>
                <h3 className="text-sm font-semibold">
                  자체 산출 플레이스 지수
                </h3>
              </div>
              <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                <Info size={10} />
                AI 자체 계산
              </span>
            </div>
            <div className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-3">
                <IndexCard
                  label="N1 관련성"
                  value={(analysis as any).n1Score}
                  icon={Target}
                  variant="brand"
                  desc="키워드 ↔ 매장 정보"
                />
                <IndexCard
                  label="N2 콘텐츠"
                  value={(analysis as any).n2Score}
                  icon={Layers}
                  variant="info"
                  desc="리뷰 + 저장 + 키워드 풍부도"
                />
                <IndexCard
                  label="N3 랭킹"
                  value={(analysis as any).n3Score}
                  icon={Award}
                  variant="warning"
                  desc="평균 순위 (1위=100)"
                />
              </div>
            </div>
          </div>

          {/* 경쟁력 점수 변동 차트 — 히스토리 데이터 사용 */}
          <CompetitiveScoreChart
            data={chartData}
            isLoading={historyLoading}
          />

          {/* 강점/약점 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 p-4 pb-3">
                <div className="size-7 rounded-lg bg-success-light flex items-center justify-center">
                  <ThumbsUp size={14} className="text-success" />
                </div>
                <h3 className="text-sm font-semibold">강점</h3>
              </div>
              <div className="px-4 pb-4">
                {strengths.length > 0 ? (
                  <ul className="space-y-2.5">
                    {strengths.map((s, i) => (
                      <li
                        key={i}
                        className="text-sm flex gap-2.5 items-start"
                      >
                        <span className="size-5 rounded-full bg-success-light flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-success">
                            {i + 1}
                          </span>
                        </span>
                        <span className="text-text-secondary leading-relaxed text-xs">
                          {s}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-tertiary">
                    AI 분석을 실행하면 표시됩니다
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 p-4 pb-3">
                <div className="size-7 rounded-lg bg-danger-light flex items-center justify-center">
                  <ThumbsDown size={14} className="text-danger" />
                </div>
                <h3 className="text-sm font-semibold">약점</h3>
              </div>
              <div className="px-4 pb-4">
                {weaknesses.length > 0 ? (
                  <ul className="space-y-2.5">
                    {weaknesses.map((w, i) => (
                      <li
                        key={i}
                        className="text-sm flex gap-2.5 items-start"
                      >
                        <span className="size-5 rounded-full bg-danger-light flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-danger">
                            {i + 1}
                          </span>
                        </span>
                        <span className="text-text-secondary leading-relaxed text-xs">
                          {w}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-tertiary">
                    AI 분석을 실행하면 표시됩니다
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* AI 추천 액션 */}
          {recommendations.length > 0 && (
            <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 p-4 pb-3">
                <div className="size-7 rounded-lg bg-warning-light flex items-center justify-center">
                  <Lightbulb size={14} className="text-warning" />
                </div>
                <h3 className="text-sm font-semibold">AI 추천 액션</h3>
              </div>
              <div className="px-4 pb-4 space-y-2">
                {recommendations.map((r: any, i: number) => {
                  const isHigh = r.priority === "HIGH";
                  const isMed = r.priority === "MEDIUM";
                  return (
                    <div
                      key={i}
                      className="flex gap-3 p-3.5 bg-surface-secondary rounded-xl"
                    >
                      <div
                        className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isHigh
                            ? "bg-danger-light text-danger"
                            : isMed
                              ? "bg-warning-light text-warning"
                              : "bg-surface-tertiary text-text-secondary"
                        }`}
                      >
                        <span className="text-xs font-bold">{i + 1}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{r.action}</p>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                              isHigh
                                ? "bg-danger-light text-danger"
                                : isMed
                                  ? "bg-warning-light text-warning"
                                  : "bg-surface-tertiary text-text-secondary"
                            }`}
                          >
                            {isHigh ? "긴급" : isMed ? "중요" : "참고"}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-1">
                          {r.reason}
                        </p>
                        {r.expectedEffect && (
                          <p className="text-xs text-brand mt-0.5 font-medium">
                            {r.expectedEffect}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function IndexCard({
  label,
  value,
  icon: Icon,
  variant,
  desc,
}: {
  label: string;
  value: number | null | undefined;
  icon: any;
  variant: "brand" | "info" | "warning";
  desc: string;
}) {
  const variantMap = {
    brand: {
      bg: "bg-brand-subtle",
      text: "text-brand",
      bar: "bg-brand",
    },
    info: {
      bg: "bg-info-light",
      text: "text-info",
      bar: "bg-info",
    },
    warning: {
      bg: "bg-warning-light",
      text: "text-warning",
      bar: "bg-warning",
    },
  } as const;
  const c = variantMap[variant];
  const has = typeof value === "number";
  const display = has ? value.toFixed(1) : "-";
  return (
    <div className={`rounded-xl p-3 ${c.bg}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} className={c.text} />
        <span className="text-[11px] font-semibold text-text-secondary">
          {label}
        </span>
      </div>
      <div
        className={`text-2xl font-black ${has ? c.text : "text-text-tertiary"}`}
      >
        {display}
      </div>
      <p className="text-[10px] text-text-tertiary mt-0.5 leading-tight">
        {desc}
      </p>
      {has && (
        <div className="mt-2 h-1 rounded-full bg-white/50 overflow-hidden">
          <div
            className={`h-full ${c.bar} rounded-full`}
            style={{ width: `${Math.min(100, value)}%` }}
          />
        </div>
      )}
    </div>
  );
}

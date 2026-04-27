"use client";

import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import {
  useWeeklyActions,
  useROI,
  useBenchmark,
  useGrade,
} from "@/hooks/useROI";
import {
  CARD_BASE,
  formatNumber,
  formatCurrency,
  getGradeConfig,
} from "@/lib/design-system";
import { Skeleton } from "@/components/ui/skeleton";
import { SalesSection } from "@/components/reports/sales-section";
import {
  Award,
  TrendingUp,
  DollarSign,
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
  Users,
  ArrowUpRight,
} from "lucide-react";

export default function ReportsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: grade, isLoading: gradeLoading } = useGrade(storeId);
  const { data: weekly, isLoading: weeklyLoading } = useWeeklyActions(storeId);
  const { data: roi, isLoading: roiLoading } = useROI(storeId);
  const { data: benchmark, isLoading: benchLoading } = useBenchmark(storeId);

  const isLoading = gradeLoading || weeklyLoading || roiLoading || benchLoading;

  const gradeConfig = grade ? getGradeConfig(grade.grade) : null;

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary">
          매출 & 마케팅 성과
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">
          매출 입력 후 일/주/월 단위로 마케팅 효과 추적
        </p>
      </div>

      {/* 매출 섹션 — 일/주/월 토글 + 차트 + AI ROI 인사이트 (사장님 룰: 본업이라 상단) */}
      <SalesSection storeId={storeId} />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* 등급 + 점수 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 등급 카드 */}
            <div className={`${CARD_BASE} overflow-hidden`}>
              <div className="p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="size-7 rounded-lg bg-warning-light flex items-center justify-center">
                    <Award size={14} className="text-warning" />
                  </div>
                  <span className="text-xs font-semibold text-text-secondary">
                    매장 등급
                  </span>
                </div>
                {gradeConfig ? (
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{gradeConfig.icon}</span>
                    <div>
                      <p
                        className={`text-lg font-black ${gradeConfig.color}`}
                      >
                        {gradeConfig.label}
                      </p>
                      <p className="text-[11px] text-text-tertiary">
                        액션 실행률{" "}
                        <strong className="text-text-secondary">
                          {grade?.actionRate ?? 0}%
                        </strong>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-tertiary">등급 없음</p>
                )}
              </div>
            </div>

            {/* 벤치마크 */}
            <div className={`${CARD_BASE} overflow-hidden`}>
              <div className="p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center">
                    <Target size={14} className="text-brand" />
                  </div>
                  <span className="text-xs font-semibold text-text-secondary">
                    지역 순위
                  </span>
                </div>
                {benchmark ? (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-text-primary">
                        {benchmark.rankInArea}
                      </span>
                      <span className="text-sm text-text-tertiary">
                        / {benchmark.totalInArea}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-1">
                      상위{" "}
                      <strong className="text-brand">
                        {benchmark.percentile}%
                      </strong>{" "}
                      · 평균 {benchmark.avgScore}점
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-text-tertiary">데이터 없음</p>
                )}
              </div>
            </div>

            {/* ROI 요약 */}
            <div className={`${CARD_BASE} overflow-hidden`}>
              <div className="p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="size-7 rounded-lg bg-success-light flex items-center justify-center">
                    <DollarSign size={14} className="text-success" />
                  </div>
                  <span className="text-xs font-semibold text-text-secondary">
                    ROI 추정
                  </span>
                </div>
                {roi ? (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-success">
                        {roi.roi}%
                      </span>
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-1">
                      {roi.roiText}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-text-tertiary">데이터 없음</p>
                )}
              </div>
            </div>
          </div>

          {/* ROI 상세 */}
          {roi && (
            <div className={`${CARD_BASE} overflow-hidden`}>
              <div className="flex items-center gap-2.5 p-4 pb-3">
                <div className="size-7 rounded-lg bg-success-light flex items-center justify-center">
                  <TrendingUp size={14} className="text-success" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">
                  ROI 상세
                </h3>
              </div>
              <div className="px-4 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-surface-secondary rounded-xl">
                    <p className="text-[11px] text-text-tertiary">
                      추가 노출
                    </p>
                    <p className="text-lg font-bold text-text-primary mt-1">
                      {formatNumber(roi.additionalExposure)}
                    </p>
                  </div>
                  <div className="p-3 bg-surface-secondary rounded-xl">
                    <p className="text-[11px] text-text-tertiary">
                      추가 방문자
                    </p>
                    <p className="text-lg font-bold text-text-primary mt-1">
                      {formatNumber(roi.additionalVisitors)}
                      <span className="text-xs text-text-tertiary font-normal">
                        명
                      </span>
                    </p>
                  </div>
                  <div className="p-3 bg-surface-secondary rounded-xl">
                    <p className="text-[11px] text-text-tertiary">
                      추가 매출 추정
                    </p>
                    <p className="text-lg font-bold text-success mt-1">
                      {formatCurrency(roi.additionalRevenue)}
                    </p>
                  </div>
                  <div className="p-3 bg-surface-secondary rounded-xl">
                    <p className="text-[11px] text-text-tertiary">
                      객단가
                    </p>
                    <p className="text-lg font-bold text-text-primary mt-1">
                      {formatCurrency(roi.avgOrderValue)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 이번 주 액션 */}
          <div className={`${CARD_BASE} overflow-hidden`}>
            <div className="flex items-center justify-between p-4 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-lg bg-info-light flex items-center justify-center">
                  <BarChart3 size={14} className="text-info" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">
                  이번 주 액션
                </h3>
              </div>
              {weekly && (
                <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
                  <span>
                    전체{" "}
                    <strong className="text-text-secondary">
                      {weekly.totalActions}
                    </strong>
                  </span>
                  <span>
                    측정{" "}
                    <strong className="text-text-secondary">
                      {weekly.measuredActions}
                    </strong>
                  </span>
                  <span>
                    개선{" "}
                    <strong className="text-success">
                      {weekly.improvedActions}
                    </strong>
                  </span>
                </div>
              )}
            </div>
            <div className="px-4 pb-4">
              {weekly && weekly.actions.length > 0 ? (
                <div className="space-y-2">
                  {weekly.actions.map((action, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 bg-surface-secondary rounded-xl"
                    >
                      <div
                        className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                          action.effectSummary
                            ? "bg-success-light"
                            : "bg-surface-tertiary"
                        }`}
                      >
                        {action.effectSummary ? (
                          <CheckCircle2 size={14} className="text-success" />
                        ) : (
                          <Clock size={14} className="text-text-tertiary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {action.description}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-text-tertiary mt-0.5">
                          <span>{action.type}</span>
                          <span>
                            {new Date(action.executedAt).toLocaleDateString(
                              "ko-KR",
                              { month: "short", day: "numeric" },
                            )}
                          </span>
                        </div>
                      </div>
                      {action.effectSummary && (
                        <span className="text-xs text-success font-medium shrink-0">
                          {action.effectSummary}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-text-tertiary">
                    이번 주 실행된 액션이 없습니다
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

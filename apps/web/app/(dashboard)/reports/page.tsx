"use client";

import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import {
  useWeeklyActions,
  useBenchmark,
  useGrade,
} from "@/hooks/useROI";
import { CARD_BASE, getGradeConfig } from "@/lib/design-system";
import { Skeleton } from "@/components/ui/skeleton";
import { SalesSection } from "@/components/reports/sales-section";
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Target,
} from "lucide-react";

export default function ReportsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: grade, isLoading: gradeLoading } = useGrade(storeId);
  const { data: weekly, isLoading: weeklyLoading } = useWeeklyActions(storeId);
  const { data: benchmark, isLoading: benchLoading } = useBenchmark(storeId);

  const isLoading = gradeLoading || weeklyLoading || benchLoading;

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
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* 컴팩트 stat bar — 등급 / 지역 순위 / 이번 주 액션 (한 줄 요약) */}
          <div className={`${CARD_BASE}`}>
            <div className="grid grid-cols-3 divide-x divide-border">
              {/* 등급 */}
              <div className="p-3 md:p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Award size={12} className="text-warning" />
                  <span className="text-[10px] font-semibold text-text-secondary">
                    매장 등급
                  </span>
                </div>
                {gradeConfig ? (
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-xl">{gradeConfig.icon}</span>
                    <span className={`text-sm font-black ${gradeConfig.color}`}>
                      {gradeConfig.label}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-text-tertiary">-</p>
                )}
                <p className="text-[10px] text-text-tertiary mt-0.5">
                  액션 실행률 {grade?.actionRate ?? 0}%
                </p>
              </div>
              {/* 지역 순위 */}
              <div className="p-3 md:p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Target size={12} className="text-brand" />
                  <span className="text-[10px] font-semibold text-text-secondary">
                    지역 순위
                  </span>
                </div>
                {benchmark ? (
                  <>
                    <p className="text-base font-black">
                      {benchmark.rankInArea}
                      <span className="text-xs text-text-tertiary font-normal">
                        {" / "}
                        {benchmark.totalInArea}
                      </span>
                    </p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      상위 <strong className="text-brand">{benchmark.percentile}%</strong>
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-text-tertiary">-</p>
                )}
              </div>
              {/* 이번 주 액션 */}
              <div className="p-3 md:p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <BarChart3 size={12} className="text-info" />
                  <span className="text-[10px] font-semibold text-text-secondary">
                    이번 주 액션
                  </span>
                </div>
                {weekly ? (
                  <>
                    <p className="text-base font-black">
                      {weekly.measuredActions}
                      <span className="text-xs text-text-tertiary font-normal">
                        {" / "}
                        {weekly.totalActions}
                      </span>
                    </p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      개선 <strong className="text-success">{weekly.improvedActions}건</strong>
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-text-tertiary">-</p>
                )}
              </div>
            </div>
          </div>

          {/* 이번 주 액션 상세 */}
          <div className={`${CARD_BASE} overflow-hidden`}>
            <div className="flex items-center justify-between p-4 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-lg bg-info-light flex items-center justify-center">
                  <BarChart3 size={14} className="text-info" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">
                  이번 주 액션 상세
                </h3>
              </div>
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

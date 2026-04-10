"use client";

import { useWeeklyActions } from "@/hooks/useROI";
import { BarChart3, CheckCircle2, TrendingUp, Zap } from "lucide-react";

export function WeeklyPerformanceCard({ storeId }: { storeId: string }) {
  const { data: weekly } = useWeeklyActions(storeId);

  if (!weekly || weekly.totalActions === 0) return null;

  return (
    <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4 md:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="size-8 rounded-xl bg-brand-subtle flex items-center justify-center">
          <BarChart3 size={16} className="text-brand" />
        </div>
        <h3 className="text-sm font-semibold">이번 주 성과</h3>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-surface-secondary p-3 text-center">
          <Zap size={14} className="text-warning mx-auto mb-1" />
          <p className="text-xl font-bold">{weekly.totalActions}</p>
          <p className="text-[10px] text-text-tertiary">수행 액션</p>
        </div>
        <div className="rounded-xl bg-surface-secondary p-3 text-center">
          <CheckCircle2 size={14} className="text-success mx-auto mb-1" />
          <p className="text-xl font-bold">{weekly.measuredActions}</p>
          <p className="text-[10px] text-text-tertiary">효과 측정</p>
        </div>
        <div className="rounded-xl bg-surface-secondary p-3 text-center">
          <TrendingUp size={14} className="text-brand mx-auto mb-1" />
          <p className="text-xl font-bold">{weekly.improvedActions}</p>
          <p className="text-[10px] text-text-tertiary">효과 있음</p>
        </div>
      </div>

      {weekly.actions.length > 0 && (
        <div className="space-y-2">
          {weekly.actions.slice(0, 3).map((action: any, i: number) => (
            <div
              key={i}
              className="flex items-center gap-2.5 text-sm"
            >
              <span
                className={`size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  action.effectSummary?.includes("상승")
                    ? "bg-success-light text-success"
                    : action.effectSummary
                      ? "bg-surface-tertiary text-text-tertiary"
                      : "bg-brand-subtle text-brand"
                }`}
              >
                {i + 1}
              </span>
              <span className="text-text-primary truncate text-xs">
                {action.description}
              </span>
              {action.effectSummary && (
                <span className="text-[10px] text-success font-medium shrink-0 ml-auto">
                  {action.effectSummary}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

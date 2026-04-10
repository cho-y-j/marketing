"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { Lightbulb, Sparkles, Loader2 } from "lucide-react";

interface Recommendation {
  priority?: string;
  action: string;
  reason?: string;
  expectedEffect?: string;
}

interface AiActionsCardProps {
  recommendations: Recommendation[];
  isLoading: boolean;
  onRunAnalysis?: () => void;
  analysisRunning?: boolean;
}

const PRIORITY_STYLE = {
  HIGH: { label: "긴급", cls: "text-danger", bg: "bg-danger-light" },
  MEDIUM: { label: "중요", cls: "text-warning", bg: "bg-warning-light" },
  LOW: { label: "참고", cls: "text-text-secondary", bg: "bg-surface-tertiary" },
} as const;

const DEFAULT_PRIORITY = PRIORITY_STYLE.LOW;

export function AiActionsCard({
  recommendations,
  isLoading,
  onRunAnalysis,
  analysisRunning,
}: AiActionsCardProps) {
  const items = (recommendations ?? []).slice(0, 3);

  return (
    <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-warning-light flex items-center justify-center">
            <Lightbulb size={14} className="text-warning" />
          </div>
          <h3 className="text-sm font-semibold">AI 추천 액션</h3>
        </div>
        {onRunAnalysis && items.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onRunAnalysis}
            disabled={analysisRunning}
            className="text-xs text-text-tertiary"
          >
            {analysisRunning ? (
              <Loader2 size={12} className="animate-spin mr-1" />
            ) : (
              <Sparkles size={12} className="mr-1" />
            )}
            다시 분석
          </Button>
        )}
      </div>
      <div className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="AI 분석을 실행해보세요"
            description="매장 데이터를 분석하면 맞춤 마케팅 액션을 추천해드립니다"
            ctaLabel="AI 분석 실행"
            onCta={onRunAnalysis}
            ctaLoading={analysisRunning}
            className="py-4"
          />
        ) : (
          <div className="space-y-2">
            {items.map((r, i) => {
              const key = (r.priority ?? "MEDIUM") as keyof typeof PRIORITY_STYLE;
              const p = PRIORITY_STYLE[key] ?? DEFAULT_PRIORITY;
              return (
                <div
                  key={i}
                  className="flex gap-3 p-3 rounded-xl bg-surface-secondary hover:bg-surface-tertiary transition-colors"
                >
                  <div
                    className={`size-6 rounded-lg ${p.bg} flex items-center justify-center shrink-0 mt-0.5`}
                  >
                    <span className={`text-[10px] font-bold ${p.cls}`}>
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold leading-tight line-clamp-2">
                        {r.action}
                      </p>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${p.bg} ${p.cls}`}
                      >
                        {p.label}
                      </span>
                    </div>
                    {r.reason && (
                      <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-1">
                        {r.reason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

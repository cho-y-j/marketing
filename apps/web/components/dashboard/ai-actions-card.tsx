"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const DEFAULT_STYLE = { label: "참고", cls: "text-gray-700", bg: "bg-gray-100" };
const PRIORITY_STYLE: Record<string, { label: string; cls: string; bg: string }> = {
  HIGH: { label: "긴급", cls: "text-rose-700", bg: "bg-rose-100" },
  MEDIUM: { label: "중요", cls: "text-amber-700", bg: "bg-amber-100" },
  LOW: DEFAULT_STYLE,
};

export function AiActionsCard({
  recommendations,
  isLoading,
  onRunAnalysis,
  analysisRunning,
}: AiActionsCardProps) {
  const items = (recommendations ?? []).slice(0, 3);

  return (
    <Card className="rounded-2xl overflow-hidden h-full">
      <CardHeader className="pb-2 bg-gradient-to-r from-blue-50/80 to-indigo-50/80">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
            <Lightbulb size={12} className="text-blue-600" />
          </div>
          AI 추천 액션
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
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
            className="py-6"
          />
        ) : (
          <div className="space-y-2">
            {items.map((r, i) => {
              const p = PRIORITY_STYLE[r.priority ?? "MEDIUM"] ?? DEFAULT_STYLE;
              return (
                <div
                  key={i}
                  className="flex gap-2.5 p-2.5 rounded-xl bg-gradient-to-r from-muted/50 to-transparent hover:from-muted transition-colors"
                >
                  <div
                    className={`w-6 h-6 rounded-lg ${p.bg} flex items-center justify-center shrink-0 mt-0.5`}
                  >
                    <span className={`text-[10px] font-bold ${p.cls}`}>{i + 1}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold leading-tight line-clamp-2">
                        {r.action}
                      </p>
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded-full font-medium shrink-0 ${p.bg} ${p.cls}`}
                      >
                        {p.label}
                      </span>
                    </div>
                    {r.reason && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {r.reason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {onRunAnalysis && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRunAnalysis}
                disabled={analysisRunning}
                className="w-full rounded-xl h-8 text-[11px] text-muted-foreground mt-1"
              >
                {analysisRunning ? (
                  <Loader2 size={12} className="animate-spin mr-1" />
                ) : (
                  <Sparkles size={12} className="mr-1" />
                )}
                분석 다시 실행
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

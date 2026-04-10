"use client";

import { EmptyState } from "@/components/common/empty-state";
import { Search, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatNumber, getTrendStyle } from "@/lib/design-system";

interface Keyword {
  keyword: string;
  monthlySearchVolume?: number | null;
  trendDirection?: string | null;
  trendPercentage?: number | null;
  currentRank?: number | null;
}

interface KeywordTrendChartProps {
  keywords: Keyword[];
}

export function KeywordTrendChart({ keywords }: KeywordTrendChartProps) {
  const maxVolume = Math.max(
    ...((keywords ?? []).map((k) => k.monthlySearchVolume ?? 0)),
    1,
  );
  const sorted = [...(keywords ?? [])].sort((a, b) => {
    if (a.currentRank != null && b.currentRank == null) return -1;
    if (a.currentRank == null && b.currentRank != null) return 1;
    return (b.monthlySearchVolume ?? 0) - (a.monthlySearchVolume ?? 0);
  });

  return (
    <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden h-full">
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-success-light flex items-center justify-center">
            <Search size={14} className="text-success" />
          </div>
          <h3 className="text-sm font-semibold">키워드 트렌드</h3>
        </div>
      </div>
      <div className="px-4 pb-4">
        {!keywords || keywords.length === 0 ? (
          <EmptyState
            icon={Search}
            title="추적 키워드를 추가해보세요"
            description="키워드를 등록하면 검색량·순위 트렌드가 표시됩니다"
            ctaLabel="키워드 추가"
            onCta={() => {
              if (typeof window !== "undefined")
                window.location.href = "/keywords";
            }}
            className="py-4"
          />
        ) : (
          <div className="space-y-3">
            {sorted.slice(0, 5).map((kw, i) => {
              const volume = kw.monthlySearchVolume ?? 0;
              const barWidth = Math.max(4, (volume / maxVolume) * 100);
              const trend = getTrendStyle(kw.trendDirection ?? null);
              const change = kw.trendPercentage ?? 0;

              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-medium truncate">
                        {kw.keyword}
                      </span>
                      {kw.currentRank != null && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-subtle text-brand font-bold shrink-0">
                          {kw.currentRank}위
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-text-tertiary">
                        {formatNumber(volume)}/월
                      </span>
                      {kw.trendDirection === "UP" && (
                        <span className={`flex items-center text-[11px] font-medium ${trend.color}`}>
                          <TrendingUp size={10} className="mr-0.5" />
                          +{change}%
                        </span>
                      )}
                      {kw.trendDirection === "DOWN" && (
                        <span className={`flex items-center text-[11px] font-medium ${trend.color}`}>
                          <TrendingDown size={10} className="mr-0.5" />
                          {change}%
                        </span>
                      )}
                      {kw.trendDirection === "STABLE" && (
                        <Minus size={10} className="text-text-tertiary" />
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand to-brand-light rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
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

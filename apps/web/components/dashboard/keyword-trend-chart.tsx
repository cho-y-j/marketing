"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { TrendingUp, TrendingDown, Minus, Search } from "lucide-react";

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
  // 순위 잡힌 키워드 우선 정렬
  const sorted = [...(keywords ?? [])].sort((a, b) => {
    if (a.currentRank != null && b.currentRank == null) return -1;
    if (a.currentRank == null && b.currentRank != null) return 1;
    return (b.monthlySearchVolume ?? 0) - (a.monthlySearchVolume ?? 0);
  });

  return (
    <Card className="rounded-2xl overflow-hidden h-full">
      <CardHeader className="pb-2 bg-gradient-to-r from-emerald-50/80 to-teal-50/80">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Search size={12} className="text-emerald-600" />
          </div>
          키워드 트렌드
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        {!keywords || keywords.length === 0 ? (
          <EmptyState
            icon={Search}
            title="추적 키워드를 추가해보세요"
            description="키워드를 등록하면 검색량·순위 트렌드가 이 차트에 표시됩니다"
            ctaLabel="키워드 추가"
            onCta={() => {
              if (typeof window !== "undefined") window.location.href = "/keywords";
            }}
            className="py-6"
          />
        ) : (
          <div className="space-y-2.5">
            {sorted.slice(0, 5).map((kw, i) => {
              const volume = kw.monthlySearchVolume ?? 0;
              const barWidth = Math.max(4, (volume / maxVolume) * 100);
              const trend = kw.trendDirection;
              const change = kw.trendPercentage ?? 0;

              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold truncate">
                        {kw.keyword}
                      </span>
                      {kw.currentRank != null && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold shrink-0">
                          {kw.currentRank}위
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-muted-foreground">
                        {volume.toLocaleString()}/월
                      </span>
                      {trend === "UP" && (
                        <span className="flex items-center text-[11px] text-emerald-600 font-medium">
                          <TrendingUp size={10} className="mr-0.5" />
                          +{change}%
                        </span>
                      )}
                      {trend === "DOWN" && (
                        <span className="flex items-center text-[11px] text-rose-600 font-medium">
                          <TrendingDown size={10} className="mr-0.5" />
                          {change}%
                        </span>
                      )}
                      {trend === "STABLE" && (
                        <Minus size={10} className="text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

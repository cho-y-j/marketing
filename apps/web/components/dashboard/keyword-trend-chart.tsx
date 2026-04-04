"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Keyword {
  keyword: string;
  monthlySearchVolume?: number | null;
  trendDirection?: string | null;
  trendPercentage?: number | null;
}

interface KeywordTrendChartProps {
  keywords: Keyword[];
}

export function KeywordTrendChart({ keywords }: KeywordTrendChartProps) {
  if (!keywords || keywords.length === 0) {
    return (
      <div className="bg-surface rounded-xl p-5 border border-border">
        <h3 className="text-sm font-medium text-text-secondary mb-3">키워드 트렌드</h3>
        <p className="text-sm text-text-secondary">키워드 데이터가 없습니다.</p>
      </div>
    );
  }

  const maxVolume = Math.max(
    ...keywords.map((k) => k.monthlySearchVolume ?? 0),
    1,
  );

  return (
    <div className="bg-surface rounded-xl p-5 border border-border">
      <h3 className="text-sm font-medium text-text-secondary mb-4">키워드 트렌드</h3>

      <div className="space-y-3">
        {keywords.slice(0, 5).map((kw, i) => {
          const volume = kw.monthlySearchVolume ?? 0;
          const barWidth = (volume / maxVolume) * 100;
          const trend = kw.trendDirection;
          const change = kw.trendPercentage ?? 0;

          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-text-primary">
                  {kw.keyword}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-secondary">
                    {volume.toLocaleString()}회/월
                  </span>
                  {trend === "UP" && (
                    <span className="flex items-center text-xs text-success">
                      <TrendingUp size={12} />
                      +{change}%
                    </span>
                  )}
                  {trend === "DOWN" && (
                    <span className="flex items-center text-xs text-danger">
                      <TrendingDown size={12} />
                      {change}%
                    </span>
                  )}
                  {trend === "STABLE" && (
                    <span className="flex items-center text-xs text-text-secondary">
                      <Minus size={12} />
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

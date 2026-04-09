"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartWrapperProps {
  title: string;
  children: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  /** 데이터 1~2건으로 차트 의미 없을 때 */
  isInsufficient?: boolean;
  insufficientMessage?: string;
  periods?: number[];
  defaultPeriod?: number;
  onPeriodChange?: (days: number) => void;
  className?: string;
}

export function ChartWrapper({
  title,
  children,
  isLoading,
  isEmpty,
  emptyMessage = "데이터가 없습니다",
  isInsufficient,
  insufficientMessage = "데이터가 쌓이고 있어요. 매일 새벽 자동 수집됩니다!",
  periods = [7, 30, 90],
  defaultPeriod = 7,
  onPeriodChange,
  className,
}: ChartWrapperProps) {
  const [activePeriod, setActivePeriod] = useState(defaultPeriod);

  const handlePeriod = (days: number) => {
    setActivePeriod(days);
    onPeriodChange?.(days);
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {onPeriodChange && (
          <div className="flex gap-1">
            {periods.map((d) => (
              <button
                key={d}
                onClick={() => handlePeriod(d)}
                className={`px-2 py-0.5 text-xs rounded-md transition-colors ${
                  activePeriod === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {d}일
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[200px] w-full" />
          </div>
        ) : isEmpty ? (
          <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-center px-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted-foreground"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
            </div>
            <p className="text-sm text-muted-foreground font-medium">{emptyMessage}</p>
          </div>
        ) : isInsufficient ? (
          <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-center px-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-500 animate-pulse"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <p className="text-sm text-muted-foreground font-medium">{insufficientMessage}</p>
            <p className="text-[11px] text-muted-foreground">내일 다시 확인해보세요</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

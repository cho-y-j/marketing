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
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

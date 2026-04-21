"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartWrapperProps {
  title: React.ReactNode;
  children: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
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
    <div
      className={cn(
        "rounded-2xl border border-border-primary bg-surface shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center">
            <TrendingUp size={14} className="text-brand" />
          </div>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {onPeriodChange && (
          <div className="flex gap-1 bg-surface-secondary rounded-lg p-0.5">
            {periods.map((d) => (
              <button
                key={d}
                onClick={() => handlePeriod(d)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors font-medium",
                  activePeriod === d
                    ? "bg-brand text-white shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary",
                )}
              >
                {d}일
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="px-4 pb-4">
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : isEmpty ? (
          <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-center px-4">
            <div className="size-10 rounded-xl bg-surface-tertiary flex items-center justify-center">
              <TrendingUp size={18} className="text-text-tertiary" />
            </div>
            <p className="text-sm text-text-secondary font-medium">
              {emptyMessage}
            </p>
          </div>
        ) : isInsufficient ? (
          <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-center px-4">
            <div className="size-10 rounded-xl bg-brand-subtle flex items-center justify-center">
              <TrendingUp size={18} className="text-brand animate-pulse" />
            </div>
            <p className="text-sm text-text-secondary font-medium">
              {insufficientMessage}
            </p>
            <p className="text-[11px] text-text-tertiary">
              내일 다시 확인해보세요
            </p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

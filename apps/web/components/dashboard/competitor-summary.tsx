"use client";

import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { Swords, ArrowRight } from "lucide-react";
import { formatNumber } from "@/lib/design-system";

interface Competitor {
  competitorName: string;
  blogReviewCount?: number | null;
  receiptReviewCount?: number | null;
  dailySearchVolume?: number | null;
}

interface CompetitorSummaryProps {
  competitors: Competitor[];
}

export function CompetitorSummary({ competitors }: CompetitorSummaryProps) {
  return (
    <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden h-full">
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-danger-light flex items-center justify-center">
            <Swords size={14} className="text-danger" />
          </div>
          <h3 className="text-sm font-semibold">경쟁 현황</h3>
        </div>
        {competitors.length > 0 && (
          <Link
            href="/competitors"
            className="text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1 transition-colors"
          >
            전체 비교 <ArrowRight size={12} />
          </Link>
        )}
      </div>
      <div className="px-4 pb-4">
        {!competitors || competitors.length === 0 ? (
          <EmptyState
            icon={Swords}
            title="경쟁 매장을 등록해보세요"
            description="같은 지역 경쟁매장을 추가하면 비교 분석이 시작됩니다"
            ctaLabel="경쟁매장 추가"
            onCta={() => {
              if (typeof window !== "undefined")
                window.location.href = "/competitors";
            }}
            className="py-4"
          />
        ) : (
          <div className="space-y-1.5">
            {competitors.slice(0, 3).map((c, i) => {
              const totalReviews =
                (c.receiptReviewCount ?? 0) + (c.blogReviewCount ?? 0);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 px-2.5 rounded-xl hover:bg-surface-secondary transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="size-5 rounded-full bg-surface-tertiary text-text-secondary text-[10px] flex items-center justify-center font-bold shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs font-medium truncate">
                      {c.competitorName}
                    </span>
                  </div>
                  <span className="text-[11px] text-text-tertiary shrink-0 ml-2">
                    리뷰{" "}
                    {totalReviews > 0 ? formatNumber(totalReviews) : "-"}건
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

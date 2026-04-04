"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";

interface Competitor {
  competitorName: string;
  blogReviewCount?: number | null;
  dailySearchVolume?: number | null;
}

interface CompetitorSummaryProps {
  competitors: Competitor[];
}

export function CompetitorSummary({ competitors }: CompetitorSummaryProps) {
  if (!competitors || competitors.length === 0) {
    return (
      <div className="bg-surface rounded-xl p-5 border border-border">
        <h3 className="text-sm font-medium text-text-secondary mb-3">경쟁 현황</h3>
        <p className="text-sm text-text-secondary">경쟁 매장 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-secondary">경쟁 현황</h3>
        <Link href="/competitors" className="text-xs text-primary hover:underline">
          전체 비교
        </Link>
      </div>

      <div className="space-y-3">
        {competitors.slice(0, 3).map((c, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2 border-b border-border last:border-0"
          >
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                {i + 1}
              </span>
              <span className="text-sm font-medium text-text-primary truncate max-w-[140px]">
                {c.competitorName}
              </span>
            </div>
            <div className="text-xs text-text-secondary">
              리뷰 {c.blogReviewCount ?? 0}건
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

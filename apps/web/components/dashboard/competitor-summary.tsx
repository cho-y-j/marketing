"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { Users } from "lucide-react";

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
    <Card className="rounded-2xl overflow-hidden h-full">
      <CardHeader className="pb-2 bg-gradient-to-r from-rose-50/80 to-pink-50/80">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center">
              <Users size={12} className="text-rose-600" />
            </div>
            경쟁 현황
          </CardTitle>
          {competitors.length > 0 && (
            <Link
              href="/competitors"
              className="text-[11px] text-primary hover:underline"
            >
              전체 비교 &rarr;
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {!competitors || competitors.length === 0 ? (
          <EmptyState
            icon={Users}
            title="경쟁 매장을 등록해보세요"
            description="같은 지역 경쟁매장을 추가하면 리뷰·검색량 비교 분석이 시작됩니다"
            ctaLabel="경쟁매장 추가"
            onCta={() => {
              if (typeof window !== "undefined") window.location.href = "/competitors";
            }}
            className="py-6"
          />
        ) : (
          <div className="space-y-2">
            {competitors.slice(0, 3).map((c, i) => {
              const totalReviews =
                (c.receiptReviewCount ?? 0) + (c.blogReviewCount ?? 0);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 text-[10px] flex items-center justify-center font-bold shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs font-semibold truncate">
                      {c.competitorName}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                    리뷰 {totalReviews > 0 ? totalReviews.toLocaleString() : "-"}건
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useCompetitorAlerts } from "@/hooks/useROI";
import { AlertTriangle, Swords, TrendingDown, Sparkles, ArrowRight } from "lucide-react";

export function CompetitorAlertCard({ storeId }: { storeId: string }) {
  const { data: alerts } = useCompetitorAlerts(storeId);

  const recent = (alerts || []).filter((a: any) => {
    const age = Date.now() - new Date(a.createdAt).getTime();
    return age < 7 * 24 * 60 * 60 * 1000;
  });

  if (recent.length === 0) return null;

  return (
    <div className="rounded-2xl border border-danger/20 bg-danger-light/30 p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-danger-light flex items-center justify-center">
            <AlertTriangle size={16} className="text-danger" />
          </div>
          <h3 className="text-sm font-semibold">
            경쟁사 알림{" "}
            <span className="text-danger font-bold">{recent.length}건</span>
          </h3>
        </div>
        <Link
          href="/competitors"
          className="text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1 transition-colors"
        >
          전체 보기 <ArrowRight size={12} />
        </Link>
      </div>

      <div className="space-y-2">
        {recent.slice(0, 3).map((alert: any) => (
          <div
            key={alert.id}
            className="bg-surface rounded-xl p-3.5 border border-border-primary"
          >
            <div className="flex items-start gap-3">
              <div
                className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
                  alert.alertType === "RANK_OVERTAKE"
                    ? "bg-danger-light"
                    : "bg-warning-light"
                }`}
              >
                {alert.alertType === "RANK_OVERTAKE" ? (
                  <Swords size={14} className="text-danger" />
                ) : (
                  <TrendingDown size={14} className="text-warning" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  &ldquo;{alert.competitorName}&rdquo;
                  {alert.alertType === "RANK_OVERTAKE"
                    ? " 순위 역전!"
                    : " 리뷰 급증"}
                </p>
                <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                  {alert.detail}
                </p>

                {alert.aiRecommendation && (
                  <div className="mt-2 flex items-start gap-1.5 p-2.5 bg-brand-subtle rounded-lg">
                    <Sparkles
                      size={12}
                      className="text-brand mt-0.5 shrink-0"
                    />
                    <p className="text-xs text-brand leading-relaxed">
                      {alert.aiRecommendation}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useCompetitorAlerts } from "@/hooks/useROI";
import { AlertTriangle, Swords, TrendingDown, Sparkles } from "lucide-react";

export function CompetitorAlertCard({ storeId }: { storeId: string }) {
  const { data: alerts } = useCompetitorAlerts(storeId);

  const recent = (alerts || []).filter((a) => {
    const age = Date.now() - new Date(a.createdAt).getTime();
    return age < 7 * 24 * 60 * 60 * 1000; // 최근 7일
  });

  if (recent.length === 0) return null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 p-5">
      <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
        <AlertTriangle size={18} className="text-red-500" />
        경쟁사 알림 {recent.length}건
      </h3>

      <div className="space-y-3">
        {recent.slice(0, 3).map((alert) => (
          <div key={alert.id} className="bg-white/70 rounded-xl p-3.5">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                alert.alertType === "RANK_OVERTAKE" ? "bg-red-100" : "bg-orange-100"
              }`}>
                {alert.alertType === "RANK_OVERTAKE" ? (
                  <Swords size={14} className="text-red-500" />
                ) : (
                  <TrendingDown size={14} className="text-orange-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  &ldquo;{alert.competitorName}&rdquo;
                  {alert.alertType === "RANK_OVERTAKE" ? " 순위 역전!" : " 리뷰 급증"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alert.detail}</p>

                {alert.aiRecommendation && (
                  <div className="mt-2 flex items-start gap-1.5 p-2 bg-blue-50 rounded-lg">
                    <Sparkles size={12} className="text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700 leading-relaxed">{alert.aiRecommendation}</p>
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

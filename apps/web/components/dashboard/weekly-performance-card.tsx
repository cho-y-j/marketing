"use client";

import { useWeeklyActions } from "@/hooks/useROI";
import { BarChart3, CheckCircle2, TrendingUp, Zap } from "lucide-react";

export function WeeklyPerformanceCard({ storeId }: { storeId: string }) {
  const { data: weekly } = useWeeklyActions(storeId);

  if (!weekly || weekly.totalActions === 0) return null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 p-5">
      <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
        <BarChart3 size={18} className="text-violet-600" />
        이번 주 성과
      </h3>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white/60 rounded-xl p-3 text-center">
          <Zap size={16} className="text-violet-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-gray-900">{weekly.totalActions}</p>
          <p className="text-xs text-gray-500">수행한 액션</p>
        </div>
        <div className="bg-white/60 rounded-xl p-3 text-center">
          <CheckCircle2 size={16} className="text-emerald-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-gray-900">{weekly.measuredActions}</p>
          <p className="text-xs text-gray-500">효과 측정</p>
        </div>
        <div className="bg-white/60 rounded-xl p-3 text-center">
          <TrendingUp size={16} className="text-blue-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-gray-900">{weekly.improvedActions}</p>
          <p className="text-xs text-gray-500">효과 있음</p>
        </div>
      </div>

      {weekly.actions.length > 0 && (
        <div className="space-y-2">
          {weekly.actions.slice(0, 3).map((action, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                action.effectSummary?.includes("상승") ? "bg-emerald-100 text-emerald-700" :
                action.effectSummary ? "bg-gray-100 text-gray-500" : "bg-violet-100 text-violet-600"
              }`}>
                {i + 1}
              </span>
              <span className="text-gray-700 truncate">{action.description}</span>
              {action.effectSummary && (
                <span className="text-xs text-emerald-600 shrink-0 ml-auto">{action.effectSummary}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

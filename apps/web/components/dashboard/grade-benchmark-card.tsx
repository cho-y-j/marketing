"use client";

import { useGrade, useBenchmark } from "@/hooks/useROI";
import { Trophy, TrendingUp, Users, Star } from "lucide-react";

const GRADE_CONFIG = {
  BRONZE: { label: "브론즈", color: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200", emoji: "🥉" },
  SILVER: { label: "실버", color: "text-gray-500", bg: "bg-gray-50", ring: "ring-gray-200", emoji: "🥈" },
  GOLD: { label: "골드", color: "text-yellow-500", bg: "bg-yellow-50", ring: "ring-yellow-200", emoji: "🥇" },
  DIAMOND: { label: "다이아", color: "text-blue-500", bg: "bg-blue-50", ring: "ring-blue-200", emoji: "💎" },
};

export function GradeBenchmarkCard({ storeId, score }: { storeId: string; score: number }) {
  const { data: grade } = useGrade(storeId);
  const { data: benchmark } = useBenchmark(storeId);

  const g = GRADE_CONFIG[(grade?.grade || "BRONZE") as keyof typeof GRADE_CONFIG];
  const scoreColor = score >= 71 ? "text-emerald-600" : score >= 41 ? "text-amber-600" : "text-rose-600";
  const scoreBg = score >= 71 ? "from-emerald-500" : score >= 41 ? "from-amber-500" : "from-rose-500";

  return (
    <div className="rounded-2xl bg-white border shadow-sm overflow-hidden">
      {/* 점수 바 */}
      <div className="relative h-2">
        <div className="absolute inset-0 bg-gray-100" />
        <div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${scoreBg} to-transparent rounded-r-full transition-all duration-1000`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between">
          {/* 왼쪽: 등급 + 점수 */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${g.bg} ring-1 ${g.ring}`}>
              <span className="text-lg">{g.emoji}</span>
              <span className={`text-sm font-bold ${g.color}`}>{g.label}</span>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-black ${scoreColor}`}>{score}</span>
                <span className="text-sm text-gray-400">/ 100</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">경쟁력 점수</p>
            </div>
          </div>

          {/* 오른쪽: 벤치마크 */}
          {benchmark && benchmark.totalInArea > 0 && (
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <Users size={14} className="text-gray-400" />
                <span className="text-sm font-medium">
                  동네 {benchmark.totalInArea}곳 중{" "}
                  <span className="text-blue-600 font-bold">{benchmark.rankInArea}위</span>
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                상위 {benchmark.percentile}% · 평균 {benchmark.avgScore}점
              </p>
            </div>
          )}
        </div>

        {/* 하단: 액션 수행률 */}
        {grade && (
          <div className="mt-4 flex gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Star size={12} className="text-amber-400" />
              <span>액션 수행률 {grade.actionRate}%</span>
            </div>
            {grade.improved > 0 && (
              <div className="flex items-center gap-1">
                <TrendingUp size={12} className="text-emerald-500" />
                <span>순위 상승 {grade.improved}개</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

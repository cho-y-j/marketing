"use client";

import { useGrade, useBenchmark } from "@/hooks/useROI";
import { Trophy, TrendingUp, Users, Zap } from "lucide-react";
import { getScoreLevel, getGradeConfig } from "@/lib/design-system";

export function GradeBenchmarkCard({
  storeId,
  score,
}: {
  storeId: string;
  score: number;
}) {
  const { data: grade } = useGrade(storeId);
  const { data: benchmark } = useBenchmark(storeId);

  const s = getScoreLevel(score);
  const g = getGradeConfig(grade?.grade || "BRONZE");

  return (
    <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden">
      {/* 점수 프로그레스 바 */}
      <div className="relative h-1.5 bg-surface-tertiary">
        <div
          className={`absolute inset-y-0 left-0 rounded-r-full transition-all duration-1000 ease-out ${s.text === "text-score-good" ? "bg-score-good" : s.text === "text-score-mid" ? "bg-score-mid" : "bg-score-bad"}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>

      <div className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* 왼쪽: 등급 + 점수 */}
          <div className="flex items-center gap-4">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${g.bg} border ${g.border}`}
            >
              <span className="text-lg">{g.icon}</span>
              <span className={`text-sm font-bold ${g.color}`}>{g.label}</span>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-black ${s.text}`}>{score}</span>
                <span className="text-sm text-text-tertiary">/ 100</span>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">경쟁력 점수</p>
            </div>
          </div>

          {/* 오른쪽: 벤치마크 */}
          {benchmark && benchmark.totalInArea > 0 && (
            <div className="flex items-center gap-4 sm:text-right">
              <div className="size-10 rounded-xl bg-brand-subtle flex items-center justify-center shrink-0 sm:hidden">
                <Trophy size={18} className="text-brand" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:justify-end">
                  <Users size={14} className="text-text-tertiary hidden sm:block" />
                  <span className="text-sm font-medium">
                    동네 {benchmark.totalInArea}곳 중{" "}
                    <span className="text-brand font-bold">
                      {benchmark.rankInArea}위
                    </span>
                  </span>
                </div>
                <p className="text-xs text-text-tertiary mt-0.5">
                  상위 {benchmark.percentile}% · 평균 {benchmark.avgScore}점
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 하단: 액션 수행률 + 순위 상승 */}
        {grade && (
          <div className="mt-4 pt-4 border-t border-border-secondary flex gap-6 text-xs">
            <div className="flex items-center gap-1.5 text-text-secondary">
              <Zap size={12} className="text-warning" />
              <span>
                액션 수행률{" "}
                <span className="font-semibold text-text-primary">
                  {grade.actionRate}%
                </span>
              </span>
            </div>
            {grade.improved > 0 && (
              <div className="flex items-center gap-1.5 text-text-secondary">
                <TrendingUp size={12} className="text-success" />
                <span>
                  순위 상승{" "}
                  <span className="font-semibold text-text-primary">
                    {grade.improved}개
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

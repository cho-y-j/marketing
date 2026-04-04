"use client";

interface StoreScoreCardProps {
  score: number | null;
  previousScore?: number | null;
}

export function StoreScoreCard({ score, previousScore }: StoreScoreCardProps) {
  const displayScore = score ?? 0;
  const diff = previousScore != null && score != null ? score - previousScore : null;

  const getColor = (s: number) => {
    if (s >= 71) return "text-success";
    if (s >= 41) return "text-warning";
    return "text-danger";
  };

  const getTrackColor = (s: number) => {
    if (s >= 71) return "#22C55E";
    if (s >= 41) return "#EAB308";
    return "#EF4444";
  };

  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (displayScore / 100) * circumference;

  return (
    <div className="bg-surface rounded-xl p-5 border border-border hover:shadow-md transition-shadow cursor-pointer">
      <h3 className="text-sm font-medium text-text-secondary mb-3">경쟁력 점수</h3>

      <div className="flex items-center gap-5">
        {/* 원형 게이지 */}
        <div className="relative w-28 h-28">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60" cy="60" r="54"
              fill="none" stroke="#E2E8F0" strokeWidth="8"
            />
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke={getTrackColor(displayScore)}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${getColor(displayScore)}`}>
              {displayScore}
            </span>
            <span className="text-xs text-text-secondary">/ 100</span>
          </div>
        </div>

        {/* 변동 */}
        <div>
          {diff !== null && (
            <div className={`text-sm font-medium ${diff >= 0 ? "text-success" : "text-danger"}`}>
              {diff >= 0 ? "+" : ""}{diff}점
              <span className="text-text-secondary font-normal ml-1">전주 대비</span>
            </div>
          )}
          <p className="text-xs text-text-secondary mt-1">
            {displayScore >= 71
              ? "좋은 편이에요!"
              : displayScore >= 41
                ? "개선 여지가 있어요"
                : "관리가 필요해요"}
          </p>
        </div>
      </div>
    </div>
  );
}

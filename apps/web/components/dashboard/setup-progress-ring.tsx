"use client";

import { Check, Loader2 } from "lucide-react";

type Step = { key: string; label: string; done: boolean };
type Progress = {
  total: number;
  completed: number;
  percent: number;
  steps: Step[];
  inProgress: boolean;
};

interface Props {
  progress: Progress;
}

/**
 * 모바일 친화 원형 진행률 배너.
 *  - 왼쪽: SVG stroke-dasharray 원형 프로그레스 (64px 모바일 / 80px 데스크탑)
 *  - 오른쪽: 6단계 체크리스트 (✓ 완료 / ⏳ 진행중)
 *  - 100% 도달 시 렌더링 생략 (상위 컴포넌트가 null 처리)
 *
 * 디자인 — CLAUDE.md 디자인 시스템 준수:
 *  - 액센트: #0071e3 (Apple Blue)
 *  - 트랙: #e5e5ea
 *  - 모바일 터치 타겟: 44px+
 */
export function SetupProgressRing({ progress }: Props) {
  if (!progress.inProgress) return null;

  const { percent, steps } = progress;
  // 모바일 64px / 데스크탑 80px. viewBox 100 기준 비율로 그림.
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - percent / 100);

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 md:p-5 flex items-center gap-4">
      {/* 원형 진행률 */}
      <div className="relative size-16 md:size-20 shrink-0">
        <svg
          viewBox="0 0 100 100"
          className="size-full -rotate-90"
          aria-label={`분석 진행률 ${percent}%`}
        >
          {/* 트랙 */}
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="#e5e5ea"
            strokeWidth="8"
          />
          {/* 진행 */}
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="#0071e3"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base md:text-lg font-bold text-primary">
            {percent}%
          </span>
        </div>
      </div>

      {/* 체크리스트 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Loader2 size={14} className="animate-spin text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground">
            매장 분석 진행 중
          </h3>
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
          {steps.map((s) => (
            <div
              key={s.key}
              className={`flex items-center gap-1 text-[11px] md:text-xs ${
                s.done ? "text-primary font-medium" : "text-muted-foreground"
              }`}
            >
              {s.done ? (
                <Check size={12} className="shrink-0" />
              ) : (
                <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" />
              )}
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

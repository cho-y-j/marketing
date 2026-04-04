"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Sparkles } from "lucide-react";

interface TodayAction {
  order: number;
  action: string;
  reason: string;
  howTo: string;
}

interface BriefingData {
  summary: string;
  trends: Array<{ keyword: string; change: string; insight: string }>;
  actions: TodayAction[];
  competitorAlert?: string | null;
}

interface TodayBriefingCardProps {
  briefing: BriefingData | null;
  isLoading?: boolean;
  onGenerate?: () => void;
}

export function TodayBriefingCard({
  briefing,
  isLoading,
  onGenerate,
}: TodayBriefingCardProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleCheck = (order: number) => {
    const next = new Set(checked);
    next.has(order) ? next.delete(order) : next.add(order);
    setChecked(next);
  };

  const toggleExpand = (order: number) => {
    const next = new Set(expanded);
    next.has(order) ? next.delete(order) : next.add(order);
    setExpanded(next);
  };

  if (!briefing) {
    return (
      <div className="bg-gradient-to-br from-primary-dark to-primary rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} />
          <h3 className="text-sm font-medium opacity-90">오늘 장사 브리핑</h3>
        </div>
        <p className="text-sm opacity-80 mb-4">
          아직 오늘의 브리핑이 생성되지 않았어요.
        </p>
        <button
          onClick={onGenerate}
          disabled={isLoading}
          className="bg-white/20 hover:bg-white/30 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading ? "생성 중..." : "브리핑 생성하기"}
        </button>
      </div>
    );
  }

  const actions: TodayAction[] = Array.isArray(briefing.actions)
    ? briefing.actions
    : [];

  return (
    <div className="bg-gradient-to-br from-primary-dark to-primary rounded-xl p-5 text-white">
      {/* 인사말 */}
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={18} />
        <h3 className="text-sm font-medium opacity-90">오늘 장사 브리핑</h3>
      </div>
      <p className="text-base font-medium mb-4">{briefing.summary}</p>

      {/* 트렌드 뱃지 */}
      {briefing.trends && briefing.trends.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {briefing.trends.map((t, i) => (
            <span
              key={i}
              className="bg-white/20 text-xs px-2.5 py-1 rounded-full"
            >
              {t.keyword} {t.change}
            </span>
          ))}
        </div>
      )}

      {/* 경쟁사 알림 */}
      {briefing.competitorAlert && (
        <div className="bg-white/10 rounded-lg p-3 mb-4 text-sm">
          {briefing.competitorAlert}
        </div>
      )}

      {/* 오늘 할 일 3가지 */}
      <div className="space-y-2">
        <p className="text-xs font-medium opacity-70 uppercase">오늘 할 일</p>
        {actions.map((action) => (
          <div key={action.order} className="bg-white/10 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <button onClick={() => toggleCheck(action.order)} className="mt-0.5">
                {checked.has(action.order) ? (
                  <CheckCircle2 size={18} className="text-green-300" />
                ) : (
                  <Circle size={18} className="opacity-60" />
                )}
              </button>
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${checked.has(action.order) ? "line-through opacity-60" : ""}`}
                >
                  {action.action}
                </p>
                <button
                  onClick={() => toggleExpand(action.order)}
                  className="text-xs opacity-60 hover:opacity-100 mt-1 flex items-center gap-1"
                >
                  {expanded.has(action.order) ? (
                    <>접기 <ChevronUp size={12} /></>
                  ) : (
                    <>왜? 어떻게? <ChevronDown size={12} /></>
                  )}
                </button>
                {expanded.has(action.order) && (
                  <div className="mt-2 text-xs opacity-80 space-y-1">
                    <p><strong>이유:</strong> {action.reason}</p>
                    <p><strong>방법:</strong> {action.howTo}</p>
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

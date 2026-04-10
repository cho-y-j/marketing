"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Sparkles,
  Loader2,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

interface TodayAction {
  order: number;
  action: string;
  reason: string;
  howTo: string;
  expectedEffect?: {
    additionalVisits?: number;
    additionalExposure?: number;
    confidence?: string;
    timeframe?: string;
  };
  priority?: string;
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

  const dateStr = new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  if (!briefing) {
    return (
      <div className="rounded-2xl border border-brand/15 bg-gradient-to-br from-brand-subtle via-indigo-50 to-violet-50 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <Sparkles size={18} className="text-brand" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">오늘 장사 브리핑</h3>
              <p className="text-xs text-text-tertiary">{dateStr}</p>
            </div>
          </div>
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">
            아직 오늘의 브리핑이 생성되지 않았어요.
            <br />
            AI가 매장 상태를 분석하고 오늘 할 일을 추천해드립니다.
          </p>
          <Button
            onClick={onGenerate}
            disabled={isLoading}
            className="bg-brand text-white hover:bg-brand-dark border-0 rounded-xl font-semibold h-10 px-5"
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin mr-2" /> 생성 중...
              </>
            ) : (
              <>
                <Sparkles size={14} className="mr-2" /> AI 브리핑 생성하기
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  const actions: TodayAction[] = Array.isArray(briefing.actions)
    ? briefing.actions
    : [];
  const doneCount = checked.size;
  const totalCount = actions.length;
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  return (
    <div className="rounded-2xl border border-brand/15 bg-gradient-to-br from-brand-subtle via-indigo-50 to-violet-50 shadow-sm overflow-hidden">
      <div className="p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <Sparkles size={18} className="text-brand" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">오늘 장사 브리핑</h3>
              <p className="text-xs text-text-tertiary">{dateStr}</p>
            </div>
          </div>
          {totalCount > 0 && (
            <div className="bg-brand/10 text-brand text-xs font-semibold px-3 py-1.5 rounded-lg">
              {doneCount}/{totalCount} 완료
            </div>
          )}
        </div>

        {/* 진행 바 */}
        {totalCount > 0 && (
          <div className="w-full h-1.5 bg-brand/10 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* 인사말 */}
        <p className="text-[15px] font-medium text-text-primary mb-4 leading-relaxed">
          {briefing.summary}
        </p>

        {/* 트렌드 뱃지 */}
        {briefing.trends && briefing.trends.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {briefing.trends.map((t, i) => (
              <span
                key={i}
                className="bg-brand/8 text-brand text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium"
              >
                <TrendingUp size={10} />
                {t.keyword}{" "}
                <span className="font-bold">{t.change}</span>
              </span>
            ))}
          </div>
        )}

        {/* 경쟁사 알림 */}
        {briefing.competitorAlert && (
          <div className="bg-warning-light rounded-xl p-3.5 mb-4 text-sm border border-warning/20 flex items-start gap-2.5">
            <AlertTriangle
              size={14}
              className="text-warning shrink-0 mt-0.5"
            />
            <span className="leading-relaxed text-text-primary">{briefing.competitorAlert}</span>
          </div>
        )}

        {/* 오늘 할 일 */}
        {actions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-3">
              오늘 할 일
            </p>
            {actions.map((action) => {
              const isDone = checked.has(action.order);
              const isOpen = expanded.has(action.order);
              return (
                <div
                  key={action.order}
                  className={`bg-surface rounded-xl p-4 border border-border-primary transition-all ${isDone ? "opacity-40" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCheck(action.order);
                      }}
                      className="mt-0.5 shrink-0"
                    >
                      {isDone ? (
                        <CheckCircle2 size={20} className="text-success" />
                      ) : (
                        <Circle size={20} className="text-text-tertiary" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-semibold leading-snug text-text-primary ${isDone ? "line-through text-text-tertiary" : ""}`}
                      >
                        {action.action}
                      </p>

                      {action.expectedEffect && !isDone && (
                        <div className="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
                          {action.expectedEffect.additionalVisits && (
                            <span className="text-success font-medium">
                              방문 +{action.expectedEffect.additionalVisits}명
                            </span>
                          )}
                          {action.expectedEffect.additionalExposure && (
                            <span className="text-info font-medium">
                              노출 +{action.expectedEffect.additionalExposure}회
                            </span>
                          )}
                          {action.expectedEffect.timeframe && (
                            <span>{action.expectedEffect.timeframe}</span>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => toggleExpand(action.order)}
                        className="text-xs text-text-tertiary hover:text-text-secondary mt-2 flex items-center gap-1 transition-colors"
                      >
                        {isOpen ? (
                          <>접기 <ChevronUp size={12} /></>
                        ) : (
                          <>왜? 어떻게? <ChevronDown size={12} /></>
                        )}
                      </button>
                      {isOpen && (
                        <div className="mt-3 text-xs text-text-secondary space-y-2 border-l-2 border-brand/20 pl-3">
                          <p><span className="font-bold text-text-tertiary">이유:</span> {action.reason}</p>
                          <p><span className="font-bold text-text-tertiary">방법:</span> {action.howTo}</p>
                        </div>
                      )}
                    </div>
                    {!isDone && (
                      <button className="shrink-0 size-8 rounded-lg bg-brand/10 hover:bg-brand/20 flex items-center justify-center transition-colors text-brand">
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

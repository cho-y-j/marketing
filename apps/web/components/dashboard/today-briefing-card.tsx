"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Sparkles, Loader2, TrendingUp, AlertTriangle } from "lucide-react";

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

export function TodayBriefingCard({ briefing, isLoading, onGenerate }: TodayBriefingCardProps) {
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
      <Card className="bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white border-0 shadow-xl rounded-2xl overflow-hidden">
        <CardContent className="pt-6 pb-6 relative">
          {/* 배경 장식 */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold">오늘 장사 브리핑</h3>
                <p className="text-xs opacity-60">AI가 매일 아침 준비합니다</p>
              </div>
            </div>
            <p className="text-sm opacity-80 mb-5 leading-relaxed">아직 오늘의 브리핑이 생성되지 않았어요.<br/>AI가 매장 상태를 분석하고 오늘 할 일을 추천해드립니다.</p>
            <Button
              onClick={onGenerate}
              disabled={isLoading}
              className="bg-white text-indigo-700 hover:bg-white/90 border-0 rounded-xl font-semibold shadow-lg h-10 px-5"
            >
              {isLoading ? <><Loader2 size={14} className="animate-spin mr-2" /> 생성 중...</> : <><Sparkles size={14} className="mr-2" /> AI 브리핑 생성하기</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const actions: TodayAction[] = Array.isArray(briefing.actions) ? briefing.actions : [];
  const doneCount = checked.size;
  const totalCount = actions.length;
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  return (
    <Card className="bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white border-0 shadow-xl rounded-2xl overflow-hidden">
      <CardContent className="pt-6 pb-5 relative">
        {/* 배경 장식 */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />

        <div className="relative">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold">오늘 장사 브리핑</h3>
                <p className="text-xs opacity-60">
                  {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}
                </p>
              </div>
            </div>
            {totalCount > 0 && (
              <div className="flex items-center gap-2">
                <Badge className="bg-white/20 text-white border-0 text-xs font-semibold backdrop-blur">
                  {doneCount}/{totalCount} 완료
                </Badge>
              </div>
            )}
          </div>

          {/* 진행 바 */}
          {totalCount > 0 && (
            <div className="w-full h-1 bg-white/20 rounded-full mb-4 overflow-hidden">
              <div className="h-full bg-white/80 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* 인사말 */}
          <p className="text-[15px] font-medium mb-4 leading-relaxed">{briefing.summary}</p>

          {/* 트렌드 뱃지 */}
          {briefing.trends && briefing.trends.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {briefing.trends.map((t, i) => (
                <span key={i} className="bg-white/15 backdrop-blur text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                  <TrendingUp size={10} />
                  {t.keyword} <span className="font-bold">{t.change}</span>
                </span>
              ))}
            </div>
          )}

          {/* 경쟁사 알림 */}
          {briefing.competitorAlert && (
            <div className="bg-white/10 backdrop-blur rounded-xl p-3.5 mb-4 text-sm border border-white/20 flex items-start gap-2">
              <AlertTriangle size={14} className="text-yellow-300 shrink-0 mt-0.5" />
              <span>{briefing.competitorAlert}</span>
            </div>
          )}

          {/* 오늘 할 일 */}
          {actions.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest">오늘 할 일</p>
              {actions.map((action) => (
                <div
                  key={action.order}
                  className={`bg-white/10 backdrop-blur rounded-xl p-4 transition-all ${checked.has(action.order) ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <button onClick={(e) => { e.stopPropagation(); toggleCheck(action.order); }} className="mt-0.5 shrink-0">
                      {checked.has(action.order) ? (
                        <CheckCircle2 size={22} className="text-emerald-300" />
                      ) : (
                        <Circle size={22} className="opacity-40" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-snug ${checked.has(action.order) ? "line-through opacity-70" : ""}`}>
                        {action.action}
                      </p>
                      <button
                        onClick={() => toggleExpand(action.order)}
                        className="text-xs opacity-40 hover:opacity-80 mt-2 flex items-center gap-1 transition-opacity"
                      >
                        {expanded.has(action.order) ? <>접기 <ChevronUp size={12} /></> : <>왜? 어떻게? <ChevronDown size={12} /></>}
                      </button>
                      {expanded.has(action.order) && (
                        <div className="mt-3 text-xs opacity-80 space-y-2 border-l-2 border-white/30 pl-3">
                          <p><span className="font-bold opacity-60">이유:</span> {action.reason}</p>
                          <p><span className="font-bold opacity-60">방법:</span> {action.howTo}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

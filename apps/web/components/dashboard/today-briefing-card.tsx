"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Sparkles, Loader2 } from "lucide-react";

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
      <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-0 shadow-lg">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">오늘 장사 브리핑</h3>
              <p className="text-xs opacity-70">AI가 매일 아침 준비합니다</p>
            </div>
          </div>
          <p className="text-sm opacity-80 mb-4">아직 오늘의 브리핑이 생성되지 않았어요.</p>
          <Button
            onClick={onGenerate}
            disabled={isLoading}
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border-0"
          >
            {isLoading ? <><Loader2 size={14} className="animate-spin mr-2" /> 생성 중...</> : "AI 브리핑 생성하기"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const actions: TodayAction[] = Array.isArray(briefing.actions) ? briefing.actions : [];
  const doneCount = checked.size;
  const totalCount = actions.length;

  return (
    <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-0 shadow-lg overflow-hidden">
      <CardContent className="pt-6 pb-5">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">오늘 장사 브리핑</h3>
              <p className="text-xs opacity-70">{new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}</p>
            </div>
          </div>
          {totalCount > 0 && (
            <Badge className="bg-white/20 text-white border-0 text-xs">
              {doneCount}/{totalCount} 완료
            </Badge>
          )}
        </div>

        {/* 인사말 */}
        <p className="text-base font-medium mb-4 leading-relaxed">{briefing.summary}</p>

        {/* 트렌드 뱃지 */}
        {briefing.trends && briefing.trends.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {briefing.trends.map((t, i) => (
              <span key={i} className="bg-white/15 backdrop-blur text-xs px-2.5 py-1 rounded-full">
                {t.keyword} <span className="font-semibold">{t.change}</span>
              </span>
            ))}
          </div>
        )}

        {/* 경쟁사 알림 */}
        {briefing.competitorAlert && (
          <div className="bg-white/10 backdrop-blur rounded-lg p-3 mb-4 text-sm border border-white/20">
            <span className="text-yellow-300 mr-1">!</span> {briefing.competitorAlert}
          </div>
        )}

        {/* 오늘 할 일 */}
        {actions.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold opacity-60 uppercase tracking-wider">오늘 할 일</p>
            {actions.map((action) => (
              <div key={action.order} className={`bg-white/10 backdrop-blur rounded-lg p-3.5 transition-all ${checked.has(action.order) ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleCheck(action.order)} className="mt-0.5 shrink-0">
                    {checked.has(action.order) ? (
                      <CheckCircle2 size={20} className="text-green-300" />
                    ) : (
                      <Circle size={20} className="opacity-50" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${checked.has(action.order) ? "line-through" : ""}`}>
                      {action.action}
                    </p>
                    <button
                      onClick={() => toggleExpand(action.order)}
                      className="text-xs opacity-50 hover:opacity-100 mt-1.5 flex items-center gap-1 transition-opacity"
                    >
                      {expanded.has(action.order) ? <>접기 <ChevronUp size={12} /></> : <>왜? 어떻게? <ChevronDown size={12} /></>}
                    </button>
                    {expanded.has(action.order) && (
                      <div className="mt-2.5 text-xs opacity-80 space-y-1.5 border-l-2 border-white/30 pl-3">
                        <p><span className="font-semibold opacity-60">이유:</span> {action.reason}</p>
                        <p><span className="font-semibold opacity-60">방법:</span> {action.howTo}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

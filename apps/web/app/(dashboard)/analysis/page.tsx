"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useLatestAnalysis, useRunAnalysis } from "@/hooks/useAnalysis";
import { useDashboard } from "@/hooks/useDashboard";
import { useCompetitors } from "@/hooks/useCompetitors";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  RefreshCw, Loader2, AlertTriangle, AlertOctagon, ChevronDown, ChevronUp,
  Clock, ArrowRight, TrendingDown, TrendingUp, Crown,
} from "lucide-react";

type Severity = "critical" | "warning" | "info";

// 상태 판정 — 문제 심각도/개수로 전체 상태 결정
function determineStatus(problems: any[]): {
  level: "severe" | "warning" | "stable";
  label: string;
  color: string;
} {
  const critical = problems.filter((p) => p.severity === "critical").length;
  const warning = problems.filter((p) => p.severity === "warning").length;
  if (critical > 0) return { level: "severe", label: "긴급 대응 필요", color: "red" };
  if (warning >= 3) return { level: "warning", label: "주의 필요", color: "amber" };
  if (warning >= 1) return { level: "warning", label: "개선 권장", color: "amber" };
  return { level: "stable", label: "안정", color: "neutral" };
}

// action type → 소요 시간 매핑 (백엔드에서 안 주는 정보라 프론트에서 추정)
function estimateMinutes(type: string): number {
  const map: Record<string, number> = {
    REVIEW: 10,
    REVIEW_REPLY: 15,
    REVIEW_CAMPAIGN: 20,
    KEYWORD_CHECK: 5,
    KEYWORD_ADD: 10,
    BLOG_CONTENT: 30,
    CONTENT_PUBLISH: 20,
    COMPETITOR_CHECK: 5,
    ANALYSIS: 5,
  };
  return map[type] ?? 15;
}

export default function AnalysisPage() {
  const { storeId } = useCurrentStoreId();
  const { data: analysis, isLoading } = useLatestAnalysis(storeId);
  const { data: dashboard, isLoading: dashLoading } = useDashboard(storeId);
  const { data: competitors } = useCompetitors(storeId);
  const runAnalysis = useRunAnalysis(storeId);
  const [showDetail, setShowDetail] = useState(false);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());

  const { data: flow } = useQuery<any>({
    queryKey: ["store-flow", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/flow`).then((r) => r.data),
    enabled: !!storeId,
  });
  const { data: competitorsDaily } = useQuery<any>({
    queryKey: ["competitors-daily", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/competitors/daily`).then((r) => r.data),
    enabled: !!storeId,
  });

  const handleReAnalyze = () => {
    toast.info("재분석 시작");
    runAnalysis.mutate(undefined, {
      onSuccess: () => toast.success("완료"),
      onError: (e: any) => toast.error("실패: " + (e.response?.data?.message || e.message)),
    });
  };

  if (isLoading || dashLoading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!analysis && !dashboard) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <h2 className="text-lg font-bold">아직 분석 결과가 없습니다</h2>
        <p className="text-sm text-muted-foreground">AI가 매장 상태를 분석합니다</p>
        <Button onClick={handleReAnalyze} disabled={runAnalysis.isPending}>
          {runAnalysis.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
          분석 시작
        </Button>
      </div>
    );
  }

  const problems = dashboard?.problems ?? [];
  const actions = (dashboard as any)?.actions ?? [];
  const status = determineStatus(problems);
  const myMetrics = dashboard?.myMetrics;
  const storeName = dashboard?.store?.name ?? "내 매장";
  const analyzedAt = analysis?.analyzedAt ? new Date(analysis.analyzedAt) : null;

  // 상위 3개 액션 (priority 내림차순)
  const topActions = [...actions].sort((a: any, b: any) => b.priority - a.priority).slice(0, 3);

  // 수치 요약 계산
  const compList = competitors ?? [];
  const myAvgRank = dashboard?.status?.avgRank ?? null;
  const compAvgRank = compList.length > 0
    ? (() => {
        const ranks: number[] = [];
        // 경쟁사는 별도 순위 없음 — 리뷰 평균 기준으로 대체 표시
        return null;
      })()
    : null;
  const myWeeklyVisitor = flow?.visitor?.last7DaysAvg ?? null;
  const compWeeklyAvg = competitorsDaily?.summary?.topVisitorAvg ?? null;
  const myVisitorTotal = myMetrics?.receiptReviewCount ?? 0;
  const avgCompVisitor =
    compList.length > 0
      ? Math.round(
          compList.reduce((s: number, c: any) => s + (c.receiptReviewCount ?? 0), 0) /
            compList.length,
        )
      : 0;
  const gapVisitor = avgCompVisitor - myVisitorTotal;

  const severeColors = status.color === "red"
    ? { border: "border-red-300", bg: "bg-red-50", text: "text-red-900", badge: "bg-red-100 text-red-700 border-red-300", icon: AlertOctagon, iconColor: "text-red-600" }
    : status.color === "amber"
      ? { border: "border-amber-300", bg: "bg-amber-50/60", text: "text-amber-950", badge: "bg-amber-100 text-amber-700 border-amber-300", icon: AlertTriangle, iconColor: "text-amber-600" }
      : { border: "border-border", bg: "bg-muted/20", text: "text-foreground", badge: "bg-muted text-muted-foreground border-border", icon: AlertTriangle, iconColor: "text-muted-foreground" };
  const StatusIcon = severeColors.icon;

  const toggleAction = (key: string) => {
    setCompletedActions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-10">
      {/* 헤더 */}
      <div className="flex items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-lg md:text-xl font-bold">{storeName}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {analyzedAt
              ? `${analyzedAt.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} 분석`
              : "분석 대기 중"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReAnalyze} disabled={runAnalysis.isPending} className="gap-1.5">
          {runAnalysis.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          재분석
        </Button>
      </div>

      {/* 1. 상태 진단 */}
      <Card className={`${severeColors.border} ${severeColors.bg}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <StatusIcon size={14} className={severeColors.iconColor} />
            <Badge variant="outline" className={`${severeColors.badge} text-[11px] font-semibold`}>
              {status.label}
            </Badge>
          </div>
          <h2 className={`text-lg md:text-xl font-bold leading-snug ${severeColors.text}`}>
            {analysis?.aiAnalysis?.summary || "분석 데이터가 생성 중입니다"}
          </h2>
          {problems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-current/10 space-y-1.5">
              {problems.slice(0, 3).map((p: any, i: number) => (
                <div key={i} className="flex items-baseline gap-2 text-xs text-foreground/80">
                  <span className="font-semibold shrink-0">·</span>
                  <span>{p.description}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. 오늘 해야 할 일 */}
      {topActions.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-sm font-bold pl-1">오늘 해야 할 일</h3>
          <div className="space-y-2">
            {topActions.map((action: any, idx: number) => {
              const minutes = estimateMinutes(action.type);
              const key = `${action.type}_${idx}`;
              const done = completedActions.has(key);
              return (
                <Card key={key} className={done ? "bg-muted/30 opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className={`text-sm font-bold ${done ? "line-through" : ""}`}>
                            {action.title}
                          </h4>
                          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                            <Clock size={10} />
                            {minutes}분
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {action.reason}
                        </p>
                        {action.expectedEffect && (
                          <p className="text-xs text-foreground/70 mt-1.5 leading-relaxed">
                            <span className="font-semibold">예상 효과:</span> {action.expectedEffect}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-border/50">
                      <button
                        onClick={() => toggleAction(key)}
                        className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted/50 transition-colors"
                      >
                        {done ? "미완료로" : "완료 체크"}
                      </button>
                      {action.href && (
                        <Link href={action.href}>
                          <button className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1">
                            실행
                            <ArrowRight size={11} />
                          </button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. 수치 요약 */}
      <section className="space-y-2.5">
        <h3 className="text-sm font-bold pl-1">수치 요약</h3>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            <MetricRow
              label="평균 키워드 순위"
              myValue={myAvgRank != null ? `${myAvgRank}위` : "-"}
              compValue={null}
              hint={myAvgRank != null && myAvgRank > 10 ? `1페이지(10위) 진입 필요` : undefined}
            />
            <MetricRow
              label="주간 발행 속도"
              myValue={myWeeklyVisitor != null ? `+${myWeeklyVisitor}/일` : "-"}
              compValue={compWeeklyAvg != null ? `경쟁 평균 +${compWeeklyAvg}/일` : null}
              hint={myWeeklyVisitor != null && compWeeklyAvg != null && myWeeklyVisitor < compWeeklyAvg
                ? "경쟁사 대비 속도 부족"
                : undefined}
              direction={myWeeklyVisitor != null && compWeeklyAvg != null
                ? myWeeklyVisitor < compWeeklyAvg ? "down" : "up"
                : undefined}
            />
            <MetricRow
              label="누적 리뷰 격차"
              myValue={gapVisitor > 0 ? `-${gapVisitor.toLocaleString()}` : "±0"}
              compValue={`경쟁 평균 ${avgCompVisitor.toLocaleString()}`}
              hint={gapVisitor > 1000
                ? "추격 어려움 — 리뷰 캠페인 집중 필요"
                : gapVisitor > 0
                  ? "추격 가능"
                  : undefined}
              direction={gapVisitor > 0 ? "down" : undefined}
            />
          </CardContent>
        </Card>
      </section>

      {/* 4. 상세 데이터 (접기) */}
      <section className="space-y-2">
        <button
          onClick={() => setShowDetail((v) => !v)}
          className="w-full flex items-center justify-between px-1 py-2 text-sm font-semibold hover:bg-muted/30 rounded-md transition-colors"
        >
          <span>상세 데이터</span>
          {showDetail ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {showDetail && (
          <div className="space-y-4">
            {/* 경쟁사 상세 */}
            {compList.length > 0 && myMetrics && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="text-xs font-bold text-muted-foreground mb-3">경쟁사 대비 누적 수치</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left py-2 font-normal">매장</th>
                          <th className="text-right py-2 font-normal">방문자 리뷰</th>
                          <th className="text-right py-2 font-normal">블로그 리뷰</th>
                          <th className="text-right py-2 font-normal">격차</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        <tr className="border-t border-border/60 bg-muted/30">
                          <td className="py-2 font-sans font-bold">
                            {storeName}
                            <span className="ml-1 text-[9px] bg-foreground text-background px-1 rounded">나</span>
                          </td>
                          <td className="text-right">{(myMetrics.receiptReviewCount ?? 0).toLocaleString()}</td>
                          <td className="text-right">{(myMetrics.blogReviewCount ?? 0).toLocaleString()}</td>
                          <td className="text-right text-muted-foreground">-</td>
                        </tr>
                        {compList.slice(0, 8).map((c: any, i: number) => {
                          const gap = (c.receiptReviewCount ?? 0) - (myMetrics.receiptReviewCount ?? 0);
                          return (
                            <tr key={i} className="border-t border-border/60">
                              <td className="py-2 font-sans">
                                {i === 0 && <Crown size={10} className="inline text-amber-500 mr-0.5" />}
                                {c.competitorName}
                              </td>
                              <td className="text-right">{(c.receiptReviewCount ?? 0).toLocaleString()}</td>
                              <td className="text-right">{(c.blogReviewCount ?? 0).toLocaleString()}</td>
                              <td className={`text-right ${gap > 0 ? "text-red-600" : gap < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                {gap > 0 ? `-${gap.toLocaleString()}` : gap < 0 ? `+${Math.abs(gap).toLocaleString()}` : "±0"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI 분석 전문 */}
            {analysis && (analysis.weaknesses as any[])?.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h4 className="text-xs font-bold text-muted-foreground">AI 심층 분석</h4>
                  <div>
                    <div className="text-[11px] font-semibold text-muted-foreground mb-1">약점</div>
                    <ul className="space-y-1 text-xs">
                      {(analysis.weaknesses as any[]).map((w: any, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-muted-foreground shrink-0">·</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {(analysis.strengths as any[])?.length > 0 && (
                    <div className="pt-2 border-t border-border/60">
                      <div className="text-[11px] font-semibold text-muted-foreground mb-1">유지 필요 (놓치지 말 것)</div>
                      <ul className="space-y-1 text-xs">
                        {(analysis.strengths as any[]).map((s: any, i: number) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-muted-foreground shrink-0">·</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricRow({
  label, myValue, compValue, hint, direction,
}: {
  label: string;
  myValue: string;
  compValue: string | null;
  hint?: string;
  direction?: "up" | "down";
}) {
  const Icon = direction === "down" ? TrendingDown : direction === "up" ? TrendingUp : null;
  const iconColor = direction === "down" ? "text-red-500" : "text-green-600";
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div className="text-right shrink-0 flex items-baseline gap-2">
        <div className="font-mono font-bold text-base inline-flex items-center gap-1">
          {Icon && <Icon size={13} className={iconColor} />}
          {myValue}
        </div>
        {compValue && <div className="text-[11px] text-muted-foreground">{compValue}</div>}
      </div>
    </div>
  );
}

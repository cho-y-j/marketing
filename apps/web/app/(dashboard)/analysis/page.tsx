"use client";

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
  RefreshCw, Loader2, AlertTriangle, AlertOctagon, ArrowRight, CheckCircle2,
  TrendingDown, Crown, Lightbulb,
} from "lucide-react";

function determineStatus(problems: any[]): {
  level: "severe" | "warning" | "stable";
  label: string;
  tone: "red" | "amber" | "neutral";
} {
  const critical = problems.filter((p) => p.severity === "critical").length;
  const warning = problems.filter((p) => p.severity === "warning").length;
  if (critical > 0) return { level: "severe", label: "긴급 대응 필요", tone: "red" };
  if (warning >= 2) return { level: "warning", label: "주의 필요", tone: "amber" };
  if (warning >= 1) return { level: "warning", label: "개선 권장", tone: "amber" };
  return { level: "stable", label: "안정", tone: "neutral" };
}

const TONE_STYLES = {
  red: { border: "border-red-300", bg: "bg-red-50", text: "text-red-900", badge: "bg-red-100 text-red-700 border-red-300", icon: AlertOctagon, iconColor: "text-red-600" },
  amber: { border: "border-amber-300", bg: "bg-amber-50/60", text: "text-amber-950", badge: "bg-amber-100 text-amber-700 border-amber-300", icon: AlertTriangle, iconColor: "text-amber-600" },
  neutral: { border: "border-border", bg: "bg-muted/20", text: "text-foreground", badge: "bg-muted text-muted-foreground border-border", icon: CheckCircle2, iconColor: "text-muted-foreground" },
} as const;

export default function AnalysisPage() {
  const { storeId } = useCurrentStoreId();
  const { data: analysis, isLoading } = useLatestAnalysis(storeId);
  const { data: dashboard, isLoading: dashLoading } = useDashboard(storeId);
  const { data: competitors } = useCompetitors(storeId);
  const runAnalysis = useRunAnalysis(storeId);

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
        <Button onClick={handleReAnalyze} disabled={runAnalysis.isPending}>
          {runAnalysis.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
          분석 시작
        </Button>
      </div>
    );
  }

  const problems = dashboard?.problems ?? [];
  const status = determineStatus(problems);
  const myMetrics = dashboard?.myMetrics;
  const storeName = dashboard?.store?.name ?? "내 매장";
  const analyzedAt = analysis?.analyzedAt ? new Date(analysis.analyzedAt) : null;
  const tone = TONE_STYLES[status.tone];
  const StatusIcon = tone.icon;

  const weaknesses = (analysis?.weaknesses as string[]) ?? [];
  const strengths = (analysis?.strengths as string[]) ?? [];
  const recommendations = (analysis?.recommendations as any[]) ?? [];

  const compList = competitors ?? [];
  const myAvgRank = dashboard?.status?.avgRank ?? null;
  const myVisitorTotal = myMetrics?.receiptReviewCount ?? 0;
  const avgCompVisitor =
    compList.length > 0
      ? Math.round(compList.reduce((s: number, c: any) => s + (c.receiptReviewCount ?? 0), 0) / compList.length)
      : 0;
  const gapVisitor = avgCompVisitor - myVisitorTotal;
  const myDailySearch = (myMetrics as any)?.dailySearchVolume ?? 0;
  const avgCompSearch = compList.length > 0
    ? Math.round(compList.reduce((s: number, c: any) => s + (c.dailySearchVolume ?? 0), 0) / compList.length)
    : 0;

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

      {/* 1. 상태 진단 + 홈으로 유도 */}
      <Card className={`${tone.border} ${tone.bg}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <StatusIcon size={14} className={tone.iconColor} />
            <Badge variant="outline" className={`${tone.badge} text-[11px] font-semibold`}>
              {status.label}
            </Badge>
          </div>
          <h2 className={`text-lg md:text-xl font-bold leading-snug ${tone.text}`}>
            {analysis?.aiAnalysis?.summary || "분석 데이터가 생성 중입니다"}
          </h2>
          {problems.length > 0 && (
            <ul className="mt-3 pt-3 border-t border-current/10 space-y-1.5">
              {problems.slice(0, 3).map((p: any, i: number) => (
                <li key={i} className="flex items-baseline gap-2 text-xs text-foreground/80">
                  <span className="font-semibold shrink-0">·</span>
                  <span>{p.description}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-current/10 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              오늘 해야 할 구체적 액션은 홈에서 확인
            </span>
            <Link href="/" className="text-xs font-semibold inline-flex items-center gap-1 hover:opacity-70">
              홈에서 실행
              <ArrowRight size={11} />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 2. 왜 이런 상황인가 — AI 약점 분석 */}
      {weaknesses.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-sm font-bold pl-1">왜 이런 상황인가</h3>
          <Card>
            <CardContent className="p-5 space-y-2.5">
              {weaknesses.map((w, i) => (
                <div key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="text-xs font-bold text-muted-foreground shrink-0 w-5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="leading-relaxed">{w}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* 3. 경쟁사 상세 비교 (일 조회수 컬럼 추가) */}
      {compList.length > 0 && myMetrics && (
        <section className="space-y-2.5">
          <h3 className="text-sm font-bold pl-1">경쟁사 상세 비교</h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground">매장</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-muted-foreground">방문자 리뷰</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-muted-foreground">블로그 리뷰</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold text-muted-foreground">일 조회수</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground">격차</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b bg-muted/40">
                      <td className="px-4 py-3 font-bold">
                        <div className="flex items-center gap-1.5">
                          {storeName}
                          <span className="text-[9px] bg-foreground text-background px-1.5 py-0.5 rounded font-bold">나</span>
                        </div>
                      </td>
                      <td className="text-right px-3 py-3 font-mono font-semibold">{(myMetrics.receiptReviewCount ?? 0).toLocaleString()}</td>
                      <td className="text-right px-3 py-3 font-mono font-semibold">{(myMetrics.blogReviewCount ?? 0).toLocaleString()}</td>
                      <td className="text-right px-3 py-3 font-mono font-semibold">{myDailySearch.toLocaleString()}</td>
                      <td className="text-right px-4 py-3 text-muted-foreground">-</td>
                    </tr>
                    {compList.slice(0, 10).map((c: any, i: number) => {
                      const gap = (c.receiptReviewCount ?? 0) - (myMetrics.receiptReviewCount ?? 0);
                      return (
                        <tr key={i} className="border-b last:border-b-0 hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {i === 0 && <Crown size={11} className="text-amber-500 shrink-0" />}
                              <span className="truncate">{c.competitorName}</span>
                            </div>
                          </td>
                          <td className="text-right px-3 py-3 font-mono">{(c.receiptReviewCount ?? 0).toLocaleString()}</td>
                          <td className="text-right px-3 py-3 font-mono">{(c.blogReviewCount ?? 0).toLocaleString()}</td>
                          <td className="text-right px-3 py-3 font-mono">
                            {(c.dailySearchVolume ?? 0) > 0 ? c.dailySearchVolume.toLocaleString() : "-"}
                          </td>
                          <td className={`text-right px-4 py-3 font-mono text-xs ${gap > 0 ? "text-red-600" : gap < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                            {gap > 0 ? `-${gap.toLocaleString()}` : gap < 0 ? `+${Math.abs(gap).toLocaleString()}` : "±0"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/20">
                    <tr className="border-t">
                      <td className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">경쟁사 평균</td>
                      <td className="text-right px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{avgCompVisitor.toLocaleString()}</td>
                      <td className="text-right px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {Math.round(compList.reduce((s: number, c: any) => s + (c.blogReviewCount ?? 0), 0) / compList.length).toLocaleString()}
                      </td>
                      <td className="text-right px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{avgCompSearch.toLocaleString()}</td>
                      <td className="text-right px-4 py-2.5 text-[11px] text-red-600 font-semibold">
                        {gapVisitor > 0 ? `나: -${gapVisitor.toLocaleString()}` : "나: 우위"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
          <p className="text-[10px] text-muted-foreground pl-1">
            일 조회수 = 매장명이 네이버에서 하루에 검색되는 횟수 (브랜드 인지도 지표)
          </p>
        </section>
      )}

      {/* 4. AI 심층 분석 (recommendations) */}
      {recommendations.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-sm font-bold pl-1">AI 개선 권장 사항</h3>
          <Card>
            <CardContent className="p-5 space-y-4">
              {recommendations.map((r: any, i: number) => {
                const priority = r.priority || "MEDIUM";
                const priorityStyle = priority === "HIGH"
                  ? "bg-red-100 text-red-700 border-red-300"
                  : priority === "LOW"
                    ? "bg-muted text-muted-foreground border-border"
                    : "bg-amber-100 text-amber-700 border-amber-300";
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                      <h4 className="text-sm font-bold">{r.action}</h4>
                      <Badge variant="outline" className={`text-[9px] py-0 ${priorityStyle}`}>
                        {priority === "HIGH" ? "1순위" : priority === "LOW" ? "참고" : "권장"}
                      </Badge>
                    </div>
                    {r.reason && (
                      <p className="text-xs text-muted-foreground leading-relaxed pl-6">
                        {r.reason}
                      </p>
                    )}
                    {r.expectedEffect && (
                      <p className="text-xs text-foreground/70 leading-relaxed pl-6">
                        <span className="font-semibold">예상 효과: </span>
                        {r.expectedEffect}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}

      {/* 5. 유지 필요 (strengths를 긍정 뉘앙스 대신 "지킬 것"으로 표현) */}
      {strengths.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-sm font-bold pl-1 text-muted-foreground">
            지켜야 할 것 — 놓치면 경쟁력 잃음
          </h3>
          <Card>
            <CardContent className="p-5 space-y-2">
              {strengths.map((s: any, i: number) => (
                <div key={i} className="flex items-baseline gap-2 text-sm">
                  <Lightbulb size={12} className="text-muted-foreground shrink-0" />
                  <span className="leading-relaxed">{s}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* 6. 수치 요약 */}
      <section className="space-y-2.5">
        <h3 className="text-sm font-bold pl-1">주요 수치</h3>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            <MetricRow
              label="평균 키워드 순위"
              myValue={myAvgRank != null ? `${myAvgRank}위` : "-"}
              compValue={null}
              hint={myAvgRank != null && myAvgRank > 10 ? "1페이지(10위) 진입 필요" : undefined}
            />
            <MetricRow
              label="내 일 조회수 (브랜드 검색)"
              myValue={myDailySearch.toLocaleString()}
              compValue={avgCompSearch > 0 ? `경쟁 평균 ${avgCompSearch.toLocaleString()}` : null}
              hint={myDailySearch > avgCompSearch * 5
                ? "압도적 인지도 확보"
                : myDailySearch < avgCompSearch
                  ? "브랜드 노출 부족"
                  : undefined}
              direction={myDailySearch > avgCompSearch ? "up" : "down"}
            />
            <MetricRow
              label="누적 리뷰 격차"
              myValue={gapVisitor > 0 ? `-${gapVisitor.toLocaleString()}` : "±0"}
              compValue={`경쟁 평균 ${avgCompVisitor.toLocaleString()}`}
              hint={gapVisitor > 1000
                ? "추격 어려움 — 리뷰 캠페인 집중"
                : gapVisitor > 0
                  ? "추격 가능"
                  : undefined}
              direction={gapVisitor > 0 ? "down" : undefined}
            />
          </CardContent>
        </Card>
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
  const Icon = direction === "down" ? TrendingDown : direction === "up" ? TrendingDown : null;
  const iconColor = direction === "down" ? "text-red-500" : "text-green-600 rotate-180";
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

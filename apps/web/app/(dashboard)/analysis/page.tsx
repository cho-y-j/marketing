"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConsultationCTA } from "@/components/common/consultation-cta";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useLatestAnalysis, useRunAnalysis } from "@/hooks/useAnalysis";
import { useDashboard } from "@/hooks/useDashboard";
import { useCompetitors } from "@/hooks/useCompetitors";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  FileText,
  Search,
  Users,
  Activity,
  Trophy,
  Crown,
} from "lucide-react";

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "심각" },
  warning: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "주의" },
  info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", label: "참고" },
};

const solutionMap: Record<string, { title: string; description: string; href: string; icon: any }> = {
  REVIEW_SHORTAGE: {
    title: "리뷰 확보 전략",
    description: "방문 고객에게 리뷰 요청, 리뷰 이벤트, AI 리뷰 답글로 참여율 높이기",
    href: "/reviews",
    icon: MessageSquare,
  },
  LOW_RANKING: {
    title: "키워드 전략 조정",
    description: "경쟁 강도가 낮은 키워드에 집중, 블로그 콘텐츠로 검색 노출 확보",
    href: "/keywords",
    icon: Search,
  },
  NO_RANKING: {
    title: "순위 체크 실행",
    description: "키워드별 현재 순위를 확인하고 전략을 수립하세요",
    href: "/keywords",
    icon: Search,
  },
  BLOG_SHORTAGE: {
    title: "블로그 콘텐츠 생성",
    description: "AI가 키워드 맞춤 블로그 글을 자동 생성해드립니다",
    href: "/content",
    icon: FileText,
  },
};

export default function AnalysisPage() {
  const { storeId } = useCurrentStoreId();
  const { data: analysis, isLoading } = useLatestAnalysis(storeId);
  const { data: dashboard, isLoading: dashLoading } = useDashboard(storeId);
  const { data: competitors } = useCompetitors(storeId);
  const runAnalysis = useRunAnalysis(storeId);

  const handleRun = () => {
    toast.info("AI 분석을 시작합니다...");
    runAnalysis.mutate(undefined, {
      onSuccess: () => toast.success("AI 분석 완료!"),
      onError: (e: any) => toast.error("분석 실패: " + (e.response?.data?.message || e.message)),
    });
  };

  if (isLoading || dashLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  if (!analysis && !dashboard) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles size={28} className="text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">아직 분석이 실행되지 않았습니다</h2>
        <p className="text-sm text-muted-foreground mb-6">
          AI가 매장의 경쟁력을 분석하고 부족한 점을 찾아드립니다
        </p>
        <Button onClick={handleRun} disabled={runAnalysis.isPending} size="lg">
          {runAnalysis.isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Sparkles size={16} className="mr-2" />}
          AI 분석 실행
        </Button>
      </div>
    );
  }

  const problems = dashboard?.problems ?? [];
  const status = dashboard?.status;
  const myMetrics = dashboard?.myMetrics;
  const compList = competitors ?? [];

  const keywords = (dashboard as any)?.keywords ?? [];

  // 경쟁사 평균 계산
  const avgCompReview = compList.length > 0
    ? Math.round(compList.reduce((s: number, c: any) => s + (c.receiptReviewCount ?? 0), 0) / compList.length)
    : 0;
  const avgCompBlog = compList.length > 0
    ? Math.round(compList.reduce((s: number, c: any) => s + (c.blogReviewCount ?? 0), 0) / compList.length)
    : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">매장 분석</h2>
          <p className="text-sm text-muted-foreground">문제 → 원인 → 해결 방향</p>
        </div>
        <Button onClick={handleRun} disabled={runAnalysis.isPending} size="sm" variant="outline">
          {runAnalysis.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : <Sparkles size={14} className="mr-1" />}
          재분석
        </Button>
      </div>

      {/* === Phase 8: 발행 속도 + 키워드별 순위 === */}
      <DailyFlowCard storeId={storeId} />
      <CompetitorDailyCard storeId={storeId} myFlow={null} />
      <KeywordRankList keywords={keywords} />

      {/* === STEP 1: 현재 상태 === */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-xs font-bold text-muted-foreground mb-3">STEP 1. 현재 상태</h3>
          <div className="flex items-center gap-4 mb-4">
            <div className={`text-3xl font-black ${
              status?.level === "HIGH" ? "text-green-600" :
              status?.level === "MEDIUM" ? "text-amber-600" : "text-red-600"
            }`}>
              {status?.level === "HIGH" ? "경쟁력 높음" :
               status?.level === "MEDIUM" ? "경쟁력 보통" : "경쟁력 낮음"}
            </div>
            {status?.avgRank && (
              <Badge variant="outline" className="text-sm">
                주요 키워드 평균 {status.avgRank}위
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              icon={MessageSquare}
              label="방문자 리뷰"
              value={myMetrics?.receiptReviewCount ?? 0}
              compare={avgCompReview}
              unit="개"
            />
            <MetricCard
              icon={FileText}
              label="블로그 리뷰"
              value={myMetrics?.blogReviewCount ?? 0}
              compare={avgCompBlog}
              unit="개"
            />
            <MetricCard
              icon={Search}
              label="일 조회수"
              value={(myMetrics as any)?.dailySearchVolume ?? 0}
              unit="회/일"
            />
            <MetricCard
              icon={Users}
              label="경쟁 매장"
              value={compList.length}
              unit="개"
            />
          </div>
        </CardContent>
      </Card>

      {/* === STEP 2: 문제 원인 === */}
      {problems.length > 0 ? (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-xs font-bold text-muted-foreground mb-3">STEP 2. 문제 원인</h3>
            <div className="space-y-3">
              {problems.map((p, i) => {
                const config = severityConfig[p.severity];
                const Icon = config.icon;
                return (
                  <div key={i} className={`rounded-lg border p-4 ${config.bg}`}>
                    <div className="flex items-start gap-3">
                      <Icon size={18} className={`shrink-0 mt-0.5 ${config.color}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{p.title}</p>
                          <Badge variant={p.severity === "critical" ? "destructive" : "secondary"} className="text-[10px]">
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                      </div>
                      {p.metric && (
                        <div className="text-right shrink-0">
                          <div className="text-xl font-black text-red-600">
                            {p.metric.current.toLocaleString()}
                            <span className="text-xs font-normal text-muted-foreground ml-0.5">{p.metric.unit}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            경쟁사 평균 {p.metric.target.toLocaleString()}{p.metric.unit}
                          </div>
                          {p.metric.target > 0 && (
                            <div className="text-xs font-semibold text-red-500 mt-0.5">
                              {Math.round(p.metric.target / Math.max(p.metric.current, 1))}배 차이
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-5 text-center">
            <CheckCircle2 size={24} className="text-green-600 mx-auto mb-2" />
            <p className="font-semibold">현재 심각한 문제가 발견되지 않았습니다</p>
            <p className="text-xs text-muted-foreground mt-1">경쟁력을 유지하기 위해 꾸준히 모니터링하세요</p>
          </CardContent>
        </Card>
      )}

      {/* === STEP 3: 해결 방향 === */}
      {problems.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-xs font-bold text-muted-foreground mb-3">STEP 3. 해결 방향</h3>
            <div className="space-y-3">
              {problems.map((p, i) => {
                const solution = solutionMap[p.type];
                if (!solution) return null;
                const Icon = solution.icon;
                return (
                  <Link key={i} href={solution.href}>
                    <div className="rounded-lg border p-4 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon size={18} className="text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{solution.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{solution.description}</p>
                      </div>
                      <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* === 경쟁사 대비 상세 비교 (참고용 — 누적 수치) === */}
      {compList.length > 0 && myMetrics && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-xs font-bold text-muted-foreground mb-3">
              참고용: 경쟁사 누적 수치 비교
              <span className="font-normal ml-2">— 실제 경쟁력은 위 일평균 발행량 기준</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">매장</th>
                    <th className="text-center px-3 py-2 font-medium">방문자 리뷰</th>
                    <th className="text-center px-3 py-2 font-medium">블로그 리뷰</th>
                    <th className="text-center px-3 py-2 font-medium">일 조회수</th>
                    <th className="text-center px-3 py-2 font-medium">리뷰 격차</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t bg-primary/5">
                    <td className="px-3 py-2.5 font-bold">
                      {dashboard?.store.name}
                      <Badge className="ml-1 text-[10px] py-0">나</Badge>
                    </td>
                    <td className="text-center px-3 py-2.5 font-bold">{(myMetrics.receiptReviewCount ?? 0).toLocaleString()}</td>
                    <td className="text-center px-3 py-2.5 font-bold">{(myMetrics.blogReviewCount ?? 0).toLocaleString()}</td>
                    <td className="text-center px-3 py-2.5 font-bold">{((myMetrics as any).dailySearchVolume ?? 0).toLocaleString()}</td>
                    <td className="text-center px-3 py-2.5">-</td>
                  </tr>
                  {compList.slice(0, 5).map((c: any, i: number) => {
                    const gap = (c.receiptReviewCount ?? 0) - (myMetrics.receiptReviewCount ?? 0);
                    const ratio = (myMetrics.receiptReviewCount ?? 0) > 0
                      ? ((c.receiptReviewCount ?? 0) / (myMetrics.receiptReviewCount ?? 1)).toFixed(1)
                      : "-";
                    return (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2.5">{c.competitorName}</td>
                        <td className="text-center px-3 py-2.5">{(c.receiptReviewCount ?? 0).toLocaleString()}</td>
                        <td className="text-center px-3 py-2.5">{(c.blogReviewCount ?? 0).toLocaleString()}</td>
                        <td className="text-center px-3 py-2.5 text-muted-foreground">
                          {(c.dailySearchVolume ?? 0) > 0 ? c.dailySearchVolume.toLocaleString() : "-"}
                        </td>
                        <td className={`text-center px-3 py-2.5 font-bold text-xs ${gap > 0 ? "text-red-600" : gap < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          <span className="inline-flex items-center gap-0.5 justify-center">
                            {gap > 0 ? <TrendingDown size={12} /> : gap < 0 ? <TrendingUp size={12} /> : null}
                            {gap > 0
                              ? `-${gap.toLocaleString()}개 (${ratio}배)`
                              : gap < 0
                                ? `+${Math.abs(gap).toLocaleString()}개`
                                : "동등"}
                          </span>
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

      {/* === 전문 상담 CTA === */}
      {problems.length > 0 && (
        <ConsultationCTA
          type="GENERAL"
          storeId={storeId}
          title="전문가의 도움이 필요하신가요?"
          description="매장 상황에 맞는 마케팅 전략을 전문가가 직접 제안해드립니다."
        />
      )}
    </div>
  );
}

// === Phase 8: 매장 발행 속도 카드 ===
function DailyFlowCard({ storeId }: { storeId?: string }) {
  const { data: flow, isLoading } = useQuery<any>({
    queryKey: ["store-flow", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/flow`).then((r) => r.data),
    enabled: !!storeId,
  });

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;

  const v = flow?.visitor;
  const b = flow?.blog;
  const noData = !v?.deltaToday && !b?.deltaToday && !v?.last7DaysAvg && !b?.last7DaysAvg;

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-blue-600" />
          <h3 className="text-sm font-bold">내 매장 발행 속도</h3>
          <span className="text-[10px] text-muted-foreground">최근 7일 평균</span>
        </div>
        {noData ? (
          <p className="text-xs text-muted-foreground py-2">
            아직 일별 스냅샷이 충분히 쌓이지 않았습니다. 매일 자동으로 수집됩니다.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FlowMetric
              label="방문자 리뷰"
              today={v?.deltaToday ?? null}
              avg7={v?.last7DaysAvg ?? null}
              cumulative={v?.current ?? null}
            />
            <FlowMetric
              label="블로그 리뷰"
              today={b?.deltaToday ?? null}
              avg7={b?.last7DaysAvg ?? null}
              cumulative={b?.current ?? null}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FlowMetric({
  label, today, avg7, cumulative,
}: { label: string; today: number | null; avg7: number | null; cumulative: number | null }) {
  return (
    <div className="bg-white rounded-lg p-3 border">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-black text-blue-600">
          {avg7 != null ? `+${avg7}` : "-"}
          <span className="text-xs font-normal text-muted-foreground ml-0.5">/일</span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
        {today != null && <span>오늘 +{today}</span>}
        {cumulative != null && <span>누적 {cumulative.toLocaleString()}</span>}
      </div>
    </div>
  );
}

// === Phase 8: 상위 1~10등 일평균 vs 내 매장 ===
function CompetitorDailyCard({ storeId, myFlow }: { storeId?: string; myFlow: any }) {
  const { data: comp, isLoading } = useQuery<any>({
    queryKey: ["competitors-daily", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/competitors/daily`).then((r) => r.data),
    enabled: !!storeId,
  });
  const { data: flow } = useQuery<any>({
    queryKey: ["store-flow", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/flow`).then((r) => r.data),
    enabled: !!storeId,
  });

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!comp) return null;

  const count = comp.summary?.count ?? 0;
  const topVisitor = comp.summary?.topVisitorAvg;
  const topBlog = comp.summary?.topBlogAvg;
  const myVisitor = flow?.visitor?.last7DaysAvg;
  const myBlog = flow?.blog?.last7DaysAvg;
  const dataReady = topVisitor != null && myVisitor != null;

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} className="text-amber-600" />
          <h3 className="text-sm font-bold">상위 매장 vs 내 매장</h3>
          <span className="text-[10px] text-muted-foreground">일평균 발행량 기준 · 경쟁사 {count}곳</span>
        </div>
        {!dataReady ? (
          <div className="bg-white rounded-lg p-4 border border-amber-200">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">일별 스냅샷 수집 중 — </span>
              하루 평균 발행 속도는 최소 2~3일치 데이터가 쌓여야 계산됩니다. 매일 자정에 자동 수집됩니다.
            </p>
            {count > 0 && (
              <div className="mt-3 pt-3 border-t space-y-1">
                <div className="text-[10px] font-semibold text-muted-foreground mb-1">현재 경쟁사 누적(참고용)</div>
                {comp.competitors?.slice(0, 3).map((c: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="truncate flex-1">{i + 1}. {c.name}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">방문 {c.visitorTotal?.toLocaleString() ?? "-"} · 블로그 {c.blogTotal?.toLocaleString() ?? "-"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <CompareBar label="방문자 리뷰" my={myVisitor} top={topVisitor} unit="개/일" />
              <CompareBar label="블로그 리뷰" my={myBlog ?? 0} top={topBlog ?? 0} unit="개/일" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t">
              상위 {count}개 매장의 일평균 발행량과 내 매장 속도 비교 — 따라잡기 가능성 진단
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CompareBar({ label, my, top, unit }: { label: string; my: number; top: number; unit: string }) {
  const max = Math.max(my, top, 1);
  const myPct = (my / max) * 100;
  const topPct = (top / max) * 100;
  const gap = +(my - top).toFixed(1); // 내 기준: 양수=앞섬, 음수=뒤처짐
  const ahead = gap > 0;
  const behind = gap < 0;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-bold inline-flex items-center gap-0.5 ${
          ahead ? "text-green-600" : behind ? "text-red-600" : "text-muted-foreground"
        }`}>
          {ahead && <TrendingUp size={12} />}
          {behind && <TrendingDown size={12} />}
          {gap > 0 ? `+${gap}` : gap}{unit}
          {!ahead && !behind && " 동등"}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] w-12 shrink-0">상위 평균</span>
          <div className="flex-1 h-4 bg-white rounded relative overflow-hidden border">
            <div className="h-full bg-amber-400 rounded" style={{ width: `${topPct}%` }} />
          </div>
          <span className="text-xs font-bold w-14 text-right">{top}{unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] w-12 shrink-0 font-bold">내 매장</span>
          <div className="flex-1 h-4 bg-white rounded relative overflow-hidden border">
            <div className="h-full bg-blue-500 rounded" style={{ width: `${myPct}%` }} />
          </div>
          <span className="text-xs font-bold w-14 text-right">{my}{unit}</span>
        </div>
      </div>
    </div>
  );
}

// === Phase 8: 키워드별 내 순위 리스트 ===
function KeywordRankList({ keywords }: { keywords: any[] }) {
  if (!keywords || keywords.length === 0) return null;
  const sorted = [...keywords].sort((a, b) => {
    if (a.currentRank == null) return 1;
    if (b.currentRank == null) return -1;
    return a.currentRank - b.currentRank;
  });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Search size={16} className="text-purple-600" />
          <h3 className="text-sm font-bold">키워드별 내 순위</h3>
          <span className="text-[10px] text-muted-foreground">{sorted.length}개</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {sorted.slice(0, 12).map((kw: any) => {
            const rank = kw.currentRank;
            const color =
              rank == null ? "bg-gray-50 text-gray-400" :
              rank === 1 ? "bg-yellow-50 border-yellow-300 text-yellow-800" :
              rank <= 3 ? "bg-blue-50 border-blue-300 text-blue-800" :
              rank <= 10 ? "bg-green-50 border-green-300 text-green-800" :
              "bg-red-50 border-red-300 text-red-800";
            return (
              <Link
                key={kw.id}
                href={`/keywords/${encodeURIComponent(kw.keyword)}`}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${color} hover:shadow-sm transition-shadow`}
              >
                <span className="text-sm font-medium truncate">{kw.keyword}</span>
                <span className="font-black text-base shrink-0 inline-flex items-center gap-1">
                  {rank === 1 && <Crown size={12} />}
                  {rank ? `${rank}위` : "-"}
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  compare,
  unit,
}: {
  icon: any;
  label: string;
  value: number;
  compare?: number;
  unit: string;
}) {
  const gap = compare ? compare - value : 0;
  return (
    <div className="rounded-lg border p-3 bg-white">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value.toLocaleString()}<span className="text-xs font-normal ml-0.5">{unit}</span></div>
      {compare != null && compare > 0 && (
        <div className={`text-[11px] mt-0.5 font-bold inline-flex items-center gap-0.5 ${gap > 0 ? "text-red-500" : gap < 0 ? "text-green-500" : "text-muted-foreground"}`}>
          {gap > 0 ? <TrendingDown size={10} /> : gap < 0 ? <TrendingUp size={10} /> : null}
          {gap > 0
            ? `-${gap.toLocaleString()}${unit} (경쟁사 대비)`
            : gap < 0
              ? `+${Math.abs(gap).toLocaleString()}${unit} 앞섬`
              : "동등"}
        </div>
      )}
    </div>
  );
}

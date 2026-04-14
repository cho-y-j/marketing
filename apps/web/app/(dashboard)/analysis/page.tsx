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
  MessageSquare,
  FileText,
  Search,
  Users,
  Bookmark,
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
              icon={Bookmark}
              label="저장 수"
              value={myMetrics?.saveCount ?? 0}
              unit="개"
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

      {/* === 경쟁사 대비 상세 비교 === */}
      {compList.length > 0 && myMetrics && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-xs font-bold text-muted-foreground mb-3">경쟁사 대비 상세 비교</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">매장</th>
                    <th className="text-center px-3 py-2 font-medium">방문자 리뷰</th>
                    <th className="text-center px-3 py-2 font-medium">블로그 리뷰</th>
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
                        <td className={`text-center px-3 py-2.5 font-semibold ${gap > 0 ? "text-red-600" : "text-green-600"}`}>
                          {gap > 0 ? `${ratio}배 뒤처짐` : gap === 0 ? "동등" : "앞서고 있음"}
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
        <div className={`text-[11px] mt-0.5 ${gap > 0 ? "text-red-500" : "text-green-500"}`}>
          {gap > 0 ? `경쟁사 대비 ${gap.toLocaleString()}${unit} 부족` : `경쟁사보다 앞섬`}
        </div>
      )}
    </div>
  );
}

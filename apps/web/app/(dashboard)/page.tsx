"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { SetupProgressCard } from "@/components/dashboard/setup-progress-card";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useCreateStore } from "@/hooks/useStore";
import { useDashboard } from "@/hooks/useDashboard";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  AlertCircle,
  Info,
  ArrowRight,
  Search,
  MessageSquare,
  FileText,
  Users,
  ChevronRight,
} from "lucide-react";
import { useEffect } from "react";

const levelConfig = {
  HIGH: { label: "경쟁력 높음", color: "text-green-600", bg: "bg-green-50 border-green-200" },
  MEDIUM: { label: "경쟁력 보통", color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  LOW: { label: "경쟁력 낮음", color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

const severityIcon = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
};

const severityStyle = {
  critical: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-blue-200 bg-blue-50",
};

const actionIcon: Record<string, any> = {
  REVIEW: MessageSquare,
  KEYWORD: Search,
  CONTENT: FileText,
  COMPETITOR: Users,
  ANALYSIS: Search,
};

export default function DashboardPage() {
  const router = useRouter();
  const { storeId, isLoading: storesLoading, hasStores, hasToken } = useCurrentStoreId();
  const createStore = useCreateStore();
  const { data: dashboard, isLoading: dashLoading } = useDashboard(storeId);

  useEffect(() => {
    if (!hasToken) router.push("/login");
  }, [hasToken, router]);

  if (!hasToken) return null;

  if (storesLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!hasStores) {
    return (
      <OnboardingCard
        onSubmit={(d) =>
          createStore.mutate(d, {
            onSuccess: (data: any) => {
              toast.success("매장이 등록되었습니다!");
              router.push(`/stores/setup?id=${data.id}&name=${encodeURIComponent(data.name)}`);
            },
            onError: (e: any) => toast.error(e.response?.data?.message || "등록 실패"),
          })
        }
        isLoading={createStore.isPending}
      />
    );
  }

  // 셋업 진행 중이면 셋업 카드만 표시
  if (storeId && !dashboard && !dashLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <SetupProgressCard storeId={storeId} />
      </div>
    );
  }

  if (dashLoading || !dashboard) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const { store, status, problems, actions, keywordRanks, competitorComparison, myMetrics, marketingPhase } = dashboard as any;
  const level = levelConfig[status.level as keyof typeof levelConfig] || levelConfig.LOW;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* 셋업 진행 */}
      {storeId && <SetupProgressCard storeId={storeId} />}

      {/* 마케팅 단계 배너 */}
      {marketingPhase && (
        <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
          <Badge variant={
            marketingPhase.code === "REVIEW_FIRST" ? "destructive" :
            marketingPhase.code === "TRAFFIC_NEEDED" ? "secondary" :
            marketingPhase.code === "OPTIMIZATION" ? "default" : "outline"
          }>
            {marketingPhase.label}
          </Badge>
          <p className="text-xs text-muted-foreground flex-1">{marketingPhase.description}</p>
        </div>
      )}

      {/* === 1. 현재 상태 요약 === */}
      <div className={`rounded-xl border-2 p-5 ${level.bg}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{store.name}</h2>
            <p className="text-sm text-muted-foreground">{store.category} · {store.address}</p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-black ${level.color}`}>
              {status.avgRank ? `평균 ${status.avgRank}위` : "순위 미확인"}
            </div>
            <Badge variant={status.level === "HIGH" ? "default" : status.level === "MEDIUM" ? "secondary" : "destructive"}>
              {level.label}
            </Badge>
          </div>
        </div>

        {/* 핵심 수치 한 줄 */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <MiniStat label="추적 키워드" value={status.totalKeywords} unit="개" />
          <MiniStat label="경쟁 매장" value={status.totalCompetitors} unit="개" />
          <MiniStat label="내 리뷰" value={status.myReviews} unit="개" />
          <MiniStat label="경쟁사 평균" value={status.avgCompetitorReviews} unit="개" />
        </div>
      </div>

      {/* === 2. 부족점 진단 === */}
      {problems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-muted-foreground">지금 부족한 것</h3>
          {problems.map((p: any, i: number) => {
            const Icon = severityIcon[p.severity as keyof typeof severityIcon] || Info;
            return (
              <div key={i} className={`rounded-lg border p-4 ${severityStyle[p.severity as keyof typeof severityStyle] || ""}`}>
                <div className="flex items-start gap-3">
                  <Icon size={18} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{p.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  </div>
                  {p.metric && (
                    <div className="text-right shrink-0">
                      <div className="text-lg font-black text-red-600">{p.metric.current}{p.metric.unit}</div>
                      <div className="text-xs text-muted-foreground">목표 {p.metric.target}{p.metric.unit}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* === 3. 오늘 해야 할 것 === */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-muted-foreground">오늘 해야 할 것</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {actions.map((action: any, i: number) => {
            const Icon = actionIcon[action.type] || Search;
            return (
              <Link key={i} href={action.href}>
                <Card className="hover:border-primary/40 hover:shadow-md transition-all cursor-pointer h-full">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon size={16} className="text-primary" />
                      </div>
                      <span className="text-xs font-bold text-primary">#{i + 1}</span>
                    </div>
                    <p className="font-semibold text-sm">{action.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                    {(action as any).reason && (
                      <p className="text-[10px] text-primary/70 mt-1.5 border-t pt-1.5">{(action as any).reason}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* === 4. 키워드별 내 순위 === */}
      {keywordRanks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-muted-foreground">키워드별 내 순위</h3>
            <Link href="/keywords" className="text-xs text-primary flex items-center gap-0.5">
              전체 보기 <ChevronRight size={12} />
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">키워드</th>
                    <th className="text-center px-3 py-2.5 font-medium">현재 순위</th>
                    <th className="text-center px-3 py-2.5 font-medium">변동</th>
                    <th className="text-right px-4 py-2.5 font-medium">월검색량</th>
                  </tr>
                </thead>
                <tbody>
                  {keywordRanks.map((kw: any, i: number) => (
                    <tr key={i} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{kw.keyword}</span>
                        {kw.type === "MAIN" && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] py-0">핵심</Badge>
                        )}
                      </td>
                      <td className="text-center px-3 py-2.5">
                        <span className={`font-bold ${
                          kw.currentRank == null ? "text-muted-foreground" :
                          kw.currentRank <= 10 ? "text-blue-600" :
                          kw.currentRank <= 30 ? "text-red-600" : "text-foreground"
                        }`}>
                          {kw.currentRank != null ? `${kw.currentRank}위` : "-"}
                        </span>
                      </td>
                      <td className="text-center px-3 py-2.5">
                        {kw.change != null ? (
                          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                            kw.change > 0 ? "text-green-600" : kw.change < 0 ? "text-red-600" : "text-muted-foreground"
                          }`}>
                            {kw.change > 0 ? <TrendingUp size={12} /> : kw.change < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                            {kw.change > 0 ? `+${kw.change}` : kw.change}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="text-right px-4 py-2.5 text-muted-foreground">
                        {kw.monthlyVolume ? kw.monthlyVolume.toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* === 5. 경쟁사 비교 === */}
      {competitorComparison.length > 0 && myMetrics && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-muted-foreground">경쟁사 비교</h3>
            <Link href="/competitors" className="text-xs text-primary flex items-center gap-0.5">
              상세 보기 <ChevronRight size={12} />
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">매장</th>
                    <th className="text-center px-3 py-2.5 font-medium">방문자리뷰</th>
                    <th className="text-center px-3 py-2.5 font-medium">블로그리뷰</th>
                    <th className="text-center px-3 py-2.5 font-medium">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 내 매장 */}
                  <tr className="border-t bg-primary/5">
                    <td className="px-4 py-2.5 font-bold">
                      {store.name}
                      <Badge className="ml-1.5 text-[10px] py-0">나</Badge>
                    </td>
                    <td className="text-center px-3 py-2.5 font-bold">
                      {(myMetrics.receiptReviewCount ?? 0).toLocaleString()}
                    </td>
                    <td className="text-center px-3 py-2.5 font-bold">
                      {(myMetrics.blogReviewCount ?? 0).toLocaleString()}
                    </td>
                    <td className="text-center px-3 py-2.5">-</td>
                  </tr>
                  {/* 경쟁사 */}
                  {competitorComparison.map((c: any, i: number) => {
                    const reviewDiff = c.receiptReviewCount - (myMetrics.receiptReviewCount ?? 0);
                    return (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2.5">{c.name}</td>
                        <td className="text-center px-3 py-2.5">{c.receiptReviewCount.toLocaleString()}</td>
                        <td className="text-center px-3 py-2.5">{c.blogReviewCount.toLocaleString()}</td>
                        <td className={`text-center px-3 py-2.5 font-semibold text-xs ${
                          reviewDiff > 0 ? "text-red-600" : reviewDiff < 0 ? "text-green-600" : ""
                        }`}>
                          {reviewDiff > 0 ? `+${reviewDiff}` : reviewDiff === 0 ? "동일" : reviewDiff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-black">{value.toLocaleString()}<span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span></div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

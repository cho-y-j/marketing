"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { SetupProgressCard } from "@/components/dashboard/setup-progress-card";
import { IngredientAlertBar } from "@/components/dashboard/ingredient-alert-bar";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useCreateStore } from "@/hooks/useStore";
import { useDashboard } from "@/hooks/useDashboard";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  AlertTriangle, AlertOctagon, CheckCircle2, Clock, ArrowRight,
  BarChart3, Swords, Search, FileEdit, MessageSquareText, CalendarDays,
  TrendingDown, TrendingUp,
} from "lucide-react";

type Severity = "critical" | "warning" | "info";

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

function estimateMinutes(type: string): number {
  const map: Record<string, number> = {
    REVIEW: 10, REVIEW_REPLY: 15, REVIEW_CAMPAIGN: 20,
    KEYWORD_CHECK: 5, KEYWORD_ADD: 10,
    BLOG_CONTENT: 30, CONTENT_PUBLISH: 20,
    COMPETITOR_CHECK: 5, ANALYSIS: 5,
  };
  return map[type] ?? 15;
}

const TONE_STYLES = {
  red: { border: "border-red-300", bg: "bg-red-50", text: "text-red-900", badge: "bg-red-100 text-red-700 border-red-300", icon: AlertOctagon, iconColor: "text-red-600" },
  amber: { border: "border-amber-300", bg: "bg-amber-50/60", text: "text-amber-950", badge: "bg-amber-100 text-amber-700 border-amber-300", icon: AlertTriangle, iconColor: "text-amber-600" },
  neutral: { border: "border-border", bg: "bg-muted/20", text: "text-foreground", badge: "bg-muted text-muted-foreground border-border", icon: CheckCircle2, iconColor: "text-muted-foreground" },
} as const;

export default function DashboardPage() {
  const router = useRouter();
  const { storeId, isLoading: storesLoading, hasStores, hasToken } = useCurrentStoreId();
  const createStore = useCreateStore();
  const { data: dashboard, isLoading: dashLoading } = useDashboard(storeId);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!hasToken) router.push("/login");
  }, [hasToken, router]);

  if (!hasToken) return null;

  if (storesLoading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!hasStores) {
    return (
      <OnboardingCard
        onSubmit={(d) =>
          createStore.mutate(d, {
            onSuccess: (data: any) => {
              toast.success("매장이 등록되었습니다");
              router.push(`/stores/setup?id=${data.id}&name=${encodeURIComponent(data.name)}`);
            },
            onError: (e: any) => toast.error(e.response?.data?.message || "등록 실패"),
          })
        }
        isLoading={createStore.isPending}
      />
    );
  }

  if (storeId && !dashboard && !dashLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <SetupProgressCard storeId={storeId} />
      </div>
    );
  }

  if (dashLoading || !dashboard) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const { store, status, problems, actions } = dashboard as any;
  const myMetrics = (dashboard as any).myMetrics;
  const diagnosis = determineStatus(problems ?? []);
  const tone = TONE_STYLES[diagnosis.tone];
  const StatusIcon = tone.icon;

  const topActions = [...(actions ?? [])].sort((a: any, b: any) => b.priority - a.priority).slice(0, 3);

  const toggleAction = (key: string) => {
    setCompletedActions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 핵심 한 줄: problems[0].description or summary
  const primaryMessage = problems?.[0]?.description || "현재 매장 상태를 모니터링 중입니다";

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-10">
      {/* 헤더 */}
      <div className="pt-1">
        <h1 className="text-lg md:text-xl font-bold">{store.name}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {store.category}
        </p>
      </div>

      {/* 셋업 진행 중만 표시 */}
      {storeId && <SetupProgressCard storeId={storeId} />}

      {/* 가격 급등 알림 (조건부) */}
      <IngredientAlertBar storeId={storeId} />

      {/* 1. 상태 진단 */}
      <Card className={`${tone.border} ${tone.bg}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-2.5">
            <StatusIcon size={14} className={tone.iconColor} />
            <Badge variant="outline" className={`${tone.badge} text-[11px] font-semibold`}>
              {diagnosis.label}
            </Badge>
            {status?.avgRank && (
              <span className="ml-auto text-xs text-muted-foreground">
                주요 키워드 평균 {status.avgRank}위
              </span>
            )}
          </div>
          <h2 className={`text-base md:text-lg font-bold leading-snug ${tone.text}`}>
            {primaryMessage}
          </h2>
          {problems?.length > 1 && (
            <ul className="mt-3 pt-3 border-t border-current/10 space-y-1.5">
              {problems.slice(1, 3).map((p: any, i: number) => (
                <li key={i} className="flex items-baseline gap-2 text-xs text-foreground/80">
                  <span className="font-semibold shrink-0">·</span>
                  <span>{p.description}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-current/10 flex justify-end">
            <Link href="/analysis" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              상세 분석 보기
              <ArrowRight size={11} />
            </Link>
          </div>
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
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {action.reason}
                        </p>
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

      {/* 3. 바로가기 */}
      <section className="space-y-2.5">
        <h3 className="text-sm font-bold pl-1">바로가기</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <QuickLink href="/keywords" icon={Search} label="키워드" hint={status?.totalKeywords ? `${status.totalKeywords}개 추적` : undefined} />
          <QuickLink href="/competitors" icon={Swords} label="경쟁 비교" hint={status?.totalCompetitors ? `${status.totalCompetitors}곳 추적` : undefined} />
          <QuickLink href="/reviews" icon={MessageSquareText} label="리뷰 관리" hint={myMetrics?.receiptReviewCount ? `누적 ${myMetrics.receiptReviewCount.toLocaleString()}개` : undefined} />
          <QuickLink href="/content" icon={FileEdit} label="콘텐츠" hint="AI 자동 생성" />
          <QuickLink href="/events" icon={CalendarDays} label="주변 축제" hint="다가오는 이벤트" />
          <QuickLink href="/analysis" icon={BarChart3} label="매장 분석" hint="상세 진단" />
        </div>
      </section>
    </div>
  );
}

function QuickLink({
  href, icon: Icon, label, hint,
}: {
  href: string;
  icon: any;
  label: string;
  hint?: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="hover:border-foreground/30 transition-colors cursor-pointer h-full">
        <CardContent className="p-3 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-foreground/70" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">{label}</div>
            {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
          </div>
          <ArrowRight size={12} className="text-muted-foreground/50 shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { SetupProgressCard } from "@/components/dashboard/setup-progress-card";
import { IngredientPriceWidget } from "@/components/dashboard/ingredient-price-widget";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useCreateStore } from "@/hooks/useStore";
import { useDashboard } from "@/hooks/useDashboard";
import { apiClient } from "@/lib/api-client";
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
  ChevronDown,
} from "lucide-react";
import { useEffect, useState } from "react";

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

  const { data: flow } = useQuery<any>({
    queryKey: ["store-flow", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/flow`).then((r) => r.data),
    enabled: !!storeId,
  });

  const { data: keywordFlow } = useQuery<Record<string, { today: number | null; yesterday: number | null; delta: number | null }>>({
    queryKey: ["keywords-flow", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/keywords/flow`).then((r) => r.data),
    enabled: !!storeId,
  });

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

      {/* 주재료 가격 (KAMIS) */}
      <IngredientPriceWidget storeId={storeId} />

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <MiniStat label="추적 키워드" value={status.totalKeywords} unit="개" />
          <MiniStat label="경쟁 매장" value={status.totalCompetitors} unit="개" />
          <MiniStat
            label="내 방문자 리뷰"
            value={flow?.visitor?.current ?? status.myReviews}
            unit="개"
            delta={flow?.visitor?.deltaToday ?? null}
          />
          <MiniStat
            label="내 블로그 리뷰"
            value={flow?.blog?.current ?? 0}
            unit="개"
            delta={flow?.blog?.deltaToday ?? null}
          />
        </div>

        {/* 10일 스파크라인 */}
        {flow?.timeline && flow.timeline.length >= 2 && (
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/40">
            <SparkRow
              label="방문자 리뷰 증가"
              points={flow.timeline.map((t: any) => t.visitorDelta)}
              color="#2563eb"
              avg7={flow?.visitor?.last7DaysAvg ?? null}
            />
            <SparkRow
              label="블로그 리뷰 증가"
              points={flow.timeline.map((t: any) => t.blogDelta)}
              color="#10b981"
              avg7={flow?.blog?.last7DaysAvg ?? null}
            />
          </div>
        )}
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
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-muted-foreground">오늘 해야 할 것</h3>
          {(dashboard as any).aiPending && (
            <span className="inline-flex items-center gap-1 text-[10px] text-primary/70 bg-primary/5 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              AI 보강 중 — 곧 업데이트됩니다
            </span>
          )}
        </div>
        <div className="space-y-2">
          {actions.map((action: any, i: number) => (
            <ActionAccordion key={i} action={action} index={i} />
          ))}
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
                    <th className="text-right px-4 py-2.5 font-medium">검색량 (어제→오늘)</th>
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
                      <td className="text-right px-4 py-2.5">
                        <KeywordVolumeCell
                          keyword={kw.keyword}
                          monthlyVolume={kw.monthlyVolume}
                          flow={keywordFlow?.[kw.keyword]}
                        />
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
                    <th className="text-center px-3 py-2.5 font-medium">일 조회수</th>
                    <th className="text-center px-3 py-2.5 font-medium">리뷰 차이</th>
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
                    <td className="text-center px-3 py-2.5 font-bold">
                      {((dashboard as any).myMetrics?.dailySearchVolume ?? status.avgCompetitorReviews)?.toLocaleString?.() ?? "-"}
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
                        <td className="text-center px-3 py-2.5 text-muted-foreground">
                          {c.dailySearchVolume > 0 ? c.dailySearchVolume.toLocaleString() : "-"}
                        </td>
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

function MiniStat({ label, value, unit, delta }: { label: string; value: number; unit: string; delta?: number | null }) {
  return (
    <div className="text-center">
      <div className="text-lg font-black">
        {value.toLocaleString()}
        <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>
        {delta != null && delta !== 0 && (
          <span className={`text-xs font-bold ml-1 ${delta > 0 ? "text-green-600" : "text-red-600"}`}>
            {delta > 0 ? `+${delta}` : delta} 오늘
          </span>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SparkRow({
  label, points, color, avg7,
}: {
  label: string;
  points: Array<number | null>;
  color: string;
  avg7: number | null;
}) {
  const vals = points.map((p) => p ?? 0);
  const max = Math.max(...vals, 1);
  const w = 100;
  const h = 28;
  const step = vals.length > 1 ? w / (vals.length - 1) : 0;
  const path = vals
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${path} L ${(vals.length - 1) * step} ${h} L 0 ${h} Z`;

  return (
    <div className="bg-white/60 rounded-lg p-2.5 border border-white/60">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {avg7 != null ? `+${avg7}/일` : "-"}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8">
        <path d={areaPath} fill={color} opacity={0.15} />
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="text-[9px] text-muted-foreground mt-0.5 text-right">최근 {points.length}일</div>
    </div>
  );
}

function KeywordVolumeCell({
  keyword: _k, monthlyVolume, flow,
}: {
  keyword: string;
  monthlyVolume: number | null;
  flow?: { today: number | null; yesterday: number | null; delta: number | null };
}) {
  if (flow && (flow.today != null || flow.yesterday != null)) {
    const t = flow.today;
    const y = flow.yesterday;
    const d = flow.delta;
    return (
      <div className="text-xs">
        <div className="font-semibold">
          {y != null ? y.toLocaleString() : "-"}
          <span className="text-muted-foreground mx-1">→</span>
          {t != null ? t.toLocaleString() : "-"}
        </div>
        {d != null && d !== 0 && (
          <div className={`text-[10px] font-bold ${d > 0 ? "text-green-600" : "text-red-600"}`}>
            {d > 0 ? `+${d}` : d}
          </div>
        )}
      </div>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {monthlyVolume ? `월 ${monthlyVolume.toLocaleString()}` : "-"}
    </span>
  );
}

const actionIconMap: Record<string, any> = {
  REVIEW: MessageSquare,
  REVIEW_REPLY: MessageSquare,
  KEYWORD: Search,
  KEYWORD_CHECK: Search,
  KEYWORD_FOCUS: Search,
  CONTENT: FileText,
  BLOG_CONTENT: FileText,
  CONTENT_REGULAR: FileText,
  COMPETITOR: Users,
  COMPETITOR_CHECK: Users,
  ANALYSIS: Search,
  MONITOR: Search,
};

function ActionAccordion({ action, index }: { action: any; index: number }) {
  const [open, setOpen] = useState(false);
  const Icon = actionIconMap[action.type] || Search;

  return (
    <Card className="overflow-hidden">
      {/* 헤더 (항상 보임) */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-primary" />
        </div>
        <span className="text-[10px] font-bold text-primary shrink-0">#{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{action.title}</p>
          {!open && action.description && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{action.description}</p>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* 펼침 영역 */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t bg-muted/10">
          <p className="text-xs text-muted-foreground mb-3 mt-2">{action.description}</p>

          {action.reason && (
            <div className="inline-flex items-start gap-1 text-[11px] bg-primary/5 text-primary/80 px-2 py-1 rounded mb-2">
              📊 <span>{action.reason}</span>
            </div>
          )}

          {action.metric && (
            <div className="flex items-center gap-2 text-xs mb-2">
              <span className="text-muted-foreground">현재</span>
              <span className="font-bold text-red-500">
                {action.metric.current?.toLocaleString()}{action.metric.unit}
              </span>
              <span className="text-muted-foreground">→ 목표</span>
              <span className="font-bold text-green-600">
                {action.metric.target?.toLocaleString()}{action.metric.unit}
              </span>
            </div>
          )}

          {action.steps && action.steps.length > 0 && (
            <ol className="space-y-1.5 mb-3 mt-3">
              {action.steps.map((s: string, idx: number) => (
                <li key={idx} className="text-xs text-foreground flex gap-2">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="flex-1">{s.replace(/^\d+단계:\s*/, "").replace(/^\d+\.\s*/, "")}</span>
                </li>
              ))}
            </ol>
          )}

          {action.expectedEffect && (
            <div className="text-xs bg-green-50 border border-green-200 text-green-700 px-2.5 py-1.5 rounded mb-3">
              💡 <span className="font-semibold">예상 효과:</span> {action.expectedEffect}
            </div>
          )}

          <Link href={action.href}>
            <button className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              ▶ 지금 시작하기
            </button>
          </Link>
        </div>
      )}
    </Card>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { SetupProgressCard } from "@/components/dashboard/setup-progress-card";
import { IngredientAlertBar } from "@/components/dashboard/ingredient-alert-bar";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useCreateStore } from "@/hooks/useStore";
import { useDashboard } from "@/hooks/useDashboard";
import { toast } from "sonner";
import {
  ArrowRight, ArrowUp, ArrowDown, Minus, Clock,
  TrendingUp, Sparkles, Flame, Target,
  Search, Swords, MessageSquareText, FileEdit,
  BarChart3, CalendarDays, DollarSign, Globe, FileBarChart,
  Gift,
} from "lucide-react";

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
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
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
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  const d = dashboard as any;
  const { store, status, problems, actions, myWeeklyGrowth, competitorWeeklyGrowth, keywordRanks } = d;

  const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const topAction = [...(actions ?? [])].sort((a: any, b: any) => b.priority - a.priority)[0];
  const restActions = [...(actions ?? [])].sort((a: any, b: any) => b.priority - a.priority).slice(1, 3);
  const topCompetitor = competitorWeeklyGrowth?.[0];

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      {/* 헤더 — 매장명 + 날짜 */}
      <div className="pt-1">
        <p className="text-xs text-muted-foreground">{today}</p>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight mt-1">{store.name}</h1>
        {store.address && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{store.address}</p>
        )}
      </div>

      {/* 셋업 진행 중 */}
      {storeId && <SetupProgressCard storeId={storeId} />}
      <IngredientAlertBar storeId={storeId} />

      {/* ═══════════════════════════════════════ */}
      {/* 섹션 1 ─ 🌅 어제까지 내 매장                 */}
      {/* ═══════════════════════════════════════ */}
      <MyStatusSection status={status} myWeeklyGrowth={myWeeklyGrowth} />

      {/* ═══════════════════════════════════════ */}
      {/* 섹션 2 ─ ⚡ 지금 경쟁 구도 (격차 강렬하게)   */}
      {/* ═══════════════════════════════════════ */}
      <CompetitionGapSection
        myGrowth={myWeeklyGrowth}
        topCompetitor={topCompetitor}
        problems={problems}
      />

      {/* ═══════════════════════════════════════ */}
      {/* 섹션 3 ─ 🎯 오늘 AI 1순위 할 일 (히어로)    */}
      {/* ═══════════════════════════════════════ */}
      {topAction && <TopActionHero action={topAction} />}

      {/* 추가 할 일 2개 */}
      {restActions.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-muted-foreground px-1 mb-2">
            추가 할 일 {restActions.length}개
          </h3>
          <div className="space-y-2">
            {restActions.map((a: any, i: number) => (
              <SecondaryAction key={i} action={a} index={i + 2} />
            ))}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* 섹션 4 ─ 🔑 내 키워드 현황 TOP 3           */}
      {/* ═══════════════════════════════════════ */}
      {keywordRanks?.length > 0 && <KeywordsPreview keywords={keywordRanks.slice(0, 3)} />}

      {/* 친구 초대 배너 — 눈에 띄게 */}
      <InviteBanner />

      {/* ═══════════════════════════════════════ */}
      {/* 섹션 5 ─ 더 둘러보기 (그리드)               */}
      {/* ═══════════════════════════════════════ */}
      <ExploreSection />
    </div>
  );
}

/* ===================================================================== */
/*  섹션 1 — 🌅 내 매장 상태 (차분한 톤)                                  */
/* ===================================================================== */
function MyStatusSection({
  status, myWeeklyGrowth,
}: {
  status: any;
  myWeeklyGrowth?: { visitor: number | null; blog: number | null; spanDays: number | null; isEstimated: boolean } | null;
}) {
  const avgRank = status?.avgRank;
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm">🌅</span>
          <h2 className="text-sm font-bold tracking-tight">내 매장 지표</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">이번 주</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatBlock
            label="주요 키워드 평균 순위"
            value={avgRank ? `${avgRank}위` : "-"}
            accent={avgRank && avgRank <= 10 ? "brand" : avgRank && avgRank <= 30 ? "default" : "warn"}
          />
          <StatBlock
            label="방문자 리뷰 증가"
            value={myWeeklyGrowth?.visitor != null ? `${fmtSigned(myWeeklyGrowth.visitor)}` : "-"}
            hint={myWeeklyGrowth?.isEstimated ? "추정" : undefined}
          />
          <StatBlock
            label="블로그 리뷰 증가"
            value={myWeeklyGrowth?.blog != null ? `${fmtSigned(myWeeklyGrowth.blog)}` : "-"}
            hint={myWeeklyGrowth?.isEstimated ? "추정" : undefined}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatBlock({ label, value, accent = "default", hint }: { label: string; value: string; accent?: "default" | "brand" | "warn"; hint?: string }) {
  const color =
    accent === "brand" ? "text-brand" : accent === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="text-center">
      <p className="text-[10px] text-muted-foreground leading-tight mb-1.5">{label}</p>
      <p className={`text-xl md:text-2xl font-black ${color}`}>{value}</p>
      {hint && <p className="text-[9px] text-muted-foreground/70 mt-0.5">{hint}</p>}
    </div>
  );
}

/* ===================================================================== */
/*  섹션 2 — ⚡ 지금 경쟁 구도 (격차 강렬하게, A 스타일)                  */
/* ===================================================================== */
function CompetitionGapSection({
  myGrowth, topCompetitor, problems,
}: {
  myGrowth?: { visitor: number | null; blog: number | null } | null;
  topCompetitor?: any;
  problems?: any[];
}) {
  const myTotal = (myGrowth?.visitor ?? 0) + (myGrowth?.blog ?? 0);
  const compTotal = (topCompetitor?.visitor ?? 0) + (topCompetitor?.blog ?? 0);
  const gap = compTotal - myTotal;
  const level = gap > 30 ? "warn" : gap > 10 ? "mild" : "safe";

  // 경쟁사 없을 때는 problems 첫 번째로 대체
  if (!topCompetitor) {
    const mainProblem = problems?.[0];
    return (
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">⚡</span>
            <h2 className="text-sm font-bold tracking-tight">지금 상황</h2>
          </div>
          <p className="text-base font-semibold leading-snug text-amber-950">
            {mainProblem?.description || "매장 상태를 수집 중입니다"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const borderColor =
    level === "warn" ? "border-red-300 bg-red-50/60" :
    level === "mild" ? "border-amber-300 bg-amber-50/40" :
    "border-border bg-muted/20";
  const valueColor =
    level === "warn" ? "text-red-600" :
    level === "mild" ? "text-amber-600" :
    "text-foreground";

  return (
    <Card className={borderColor}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm">⚡</span>
          <h2 className="text-sm font-bold tracking-tight">지금 경쟁 구도</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">최근 7일</span>
        </div>

        {/* 가장 공격적 경쟁사 */}
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              <Flame size={11} className="inline -mt-0.5 mr-0.5 text-red-500" />
              가장 공격적 경쟁사
            </span>
            <span className="text-xs font-semibold truncate max-w-[180px]">{topCompetitor.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-3xl md:text-4xl font-black tracking-tight ${valueColor}`}>
              +{compTotal}
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              방문자 +{topCompetitor.visitor ?? 0}<br />
              블로그 +{topCompetitor.blog ?? 0}
            </div>
          </div>
        </div>

        <div className="border-t border-current/10 pt-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs font-semibold text-muted-foreground">우리 매장</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-3xl md:text-4xl font-black tracking-tight text-foreground/80">
              +{myTotal}
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              방문자 +{myGrowth?.visitor ?? 0}<br />
              블로그 +{myGrowth?.blog ?? 0}
            </div>
          </div>
        </div>

        {/* 격차 요약 */}
        <div className="mt-4 pt-3 border-t border-current/10 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">일주일간 격차</p>
            <p className={`text-lg font-black ${valueColor}`}>
              {gap > 0 ? `+${gap}건 벌어짐` : gap < 0 ? `${Math.abs(gap)}건 앞섬` : "동률"}
            </p>
          </div>
          <Link
            href="/competitors"
            className="text-xs font-semibold text-foreground hover:text-brand inline-flex items-center gap-1"
          >
            경쟁 한눈에
            <ArrowRight size={12} />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===================================================================== */
/*  섹션 3 — 🎯 AI 오늘 1순위 할 일 (히어로)                              */
/* ===================================================================== */
function TopActionHero({ action }: { action: any }) {
  const estimateMin: Record<string, number> = {
    REVIEW: 10, REVIEW_REPLY: 15, REVIEW_CAMPAIGN: 20,
    KEYWORD_CHECK: 5, KEYWORD_ADD: 10,
    BLOG_CONTENT: 30, CONTENT_PUBLISH: 20,
    COMPETITOR_CHECK: 5, ANALYSIS: 5,
  };
  const minutes = estimateMin[action.type] ?? 15;

  return (
    <Card className="border-brand/40 bg-gradient-to-br from-brand-subtle/40 to-transparent shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-brand" />
          <span className="text-xs font-bold text-brand">AI가 추천하는 오늘의 1순위</span>
        </div>
        <h2 className="text-lg md:text-xl font-black leading-tight tracking-tight mb-3">
          {action.title}
        </h2>
        {action.reason && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {action.reason}
          </p>
        )}
        <div className="flex items-center gap-3 mb-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            약 {minutes}분
          </span>
          {action.expectedImpact && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <TrendingUp size={11} />
                {action.expectedImpact}
              </span>
            </>
          )}
        </div>
        {action.href && (
          <Link href={action.href} className="block">
            <button className="w-full h-12 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark transition-colors inline-flex items-center justify-center gap-2">
              지금 실행하기
              <ArrowRight size={14} />
            </button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function SecondaryAction({ action, index }: { action: any; index: number }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-muted text-foreground flex items-center justify-center text-sm font-bold shrink-0">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{action.title}</p>
          {action.reason && (
            <p className="text-[11px] text-muted-foreground truncate">{action.reason}</p>
          )}
        </div>
        {action.href && (
          <Link href={action.href}>
            <button className="text-[11px] font-semibold text-brand px-2 py-1 hover:underline">
              실행 →
            </button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

/* ===================================================================== */
/*  섹션 4 — 🔑 내 키워드 TOP 3 미리보기                                  */
/* ===================================================================== */
function KeywordsPreview({ keywords }: { keywords: any[] }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-1">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Target size={14} className="text-brand" />
          내 키워드 현황
        </h3>
        <Link href="/keywords" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          전체 보기
          <ArrowRight size={10} />
        </Link>
      </div>
      <div className="space-y-2">
        {keywords.map((k: any, i: number) => (
          <Link key={i} href={`/keywords/${encodeURIComponent(k.keyword)}`} className="block">
            <Card className="hover:border-brand/30 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{k.keyword}</p>
                  <p className="text-[11px] text-muted-foreground">
                    월 {k.monthlyVolume?.toLocaleString() ?? 0}회 검색
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-black ${
                    k.currentRank == null ? "text-muted-foreground" :
                    k.currentRank <= 3 ? "text-brand" :
                    k.currentRank <= 10 ? "text-foreground" : "text-amber-600"
                  }`}>
                    {k.currentRank ? `${k.currentRank}위` : "—"}
                  </p>
                  {k.change != null && k.change !== 0 && (
                    <p className={`text-[10px] font-semibold inline-flex items-center gap-0.5 ${
                      k.change > 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      {k.change > 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                      {Math.abs(k.change)}
                    </p>
                  )}
                  {k.change === 0 && (
                    <p className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                      <Minus size={9} /> 유지
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ===================================================================== */
/*  섹션 5 — 더 둘러보기                                                   */
/* ===================================================================== */
function InviteBanner() {
  return (
    <Link href="/invite" className="block">
      <Card className="border-brand/30 bg-gradient-to-r from-brand-subtle/60 via-amber-50/50 to-transparent hover:border-brand/50 transition-colors">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center">
            <Gift size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">친구 초대하고 포인트 받기</p>
            <p className="text-[11px] text-muted-foreground truncate">
              사장님 친구에게 추천 코드를 공유하세요 · 초대 1명당 2,000P
            </p>
          </div>
          <ArrowRight size={16} className="text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

function ExploreSection() {
  const links = [
    { href: "/competitors", icon: Swords, label: "경쟁 한눈에", hint: "지금 상황 비교" },
    { href: "/analysis", icon: BarChart3, label: "매장 분석", hint: "상세 진단" },
    { href: "/reviews", icon: MessageSquareText, label: "리뷰 관리", hint: "AI 답글" },
    { href: "/content", icon: FileEdit, label: "콘텐츠", hint: "AI 블로그" },
    { href: "/events", icon: CalendarDays, label: "시즌 이벤트", hint: "주변 축제" },
    { href: "/reports", icon: FileBarChart, label: "리포트", hint: "주간 성과" },
    { href: "/ingredients", icon: DollarSign, label: "원가 관리", hint: "가격 추적" },
    { href: "/foreign-market", icon: Globe, label: "외국인 상권", hint: "해외 고객" },
    { href: "/invite", icon: Gift, label: "친구 초대", hint: "포인트 적립" },
  ];
  return (
    <section>
      <h3 className="text-sm font-bold mb-2.5 px-1">더 둘러보기</h3>
      <div className="grid grid-cols-2 gap-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="hover:border-brand/30 transition-colors h-full">
              <CardContent className="p-3 flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                  <l.icon size={16} className="text-foreground/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-tight">{l.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{l.hint}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

function fmtSigned(n: number) {
  if (n === 0) return "±0";
  return n > 0 ? `+${n}` : `${n}`;
}

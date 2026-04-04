"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TodayBriefingCard } from "@/components/dashboard/today-briefing-card";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { RankHistoryChart } from "@/components/charts/rank-history-chart";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useStore, useCreateStore } from "@/hooks/useStore";
import { useTodayBriefing, useGenerateBriefing } from "@/hooks/useBriefing";
import { useKeywords } from "@/hooks/useKeywords";
import { useCompetitors } from "@/hooks/useCompetitors";
import { useRankHistory } from "@/hooks/useRankHistory";
import { toast } from "sonner";
import {
  BarChart3, FileText, Search, Sparkles, Trophy, Users, Star, Loader2,
  TrendingUp, TrendingDown, ArrowRight,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { storeId, stores, isLoading: storesLoading, hasStores, hasToken } = useCurrentStoreId();
  const { data: store } = useStore(storeId);
  const { data: briefing } = useTodayBriefing(storeId);
  const { data: keywords } = useKeywords(storeId);
  const { data: competitors } = useCompetitors(storeId);
  const { data: rankData } = useRankHistory(storeId, 7);
  const generateBriefing = useGenerateBriefing(storeId);
  const createStore = useCreateStore();

  if (!hasToken && typeof window !== "undefined") {
    router.push("/login");
    return null;
  }

  if (storesLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!hasStores) {
    return (
      <OnboardingCard
        onSubmit={(d) => createStore.mutate(d, {
          onSuccess: (data: any) => {
            toast.success("매장이 등록되었습니다! AI 분석을 시작합니다.");
            router.push(`/stores/setup?id=${data.id}&name=${encodeURIComponent(data.name)}`);
          },
          onError: (e: any) => toast.error(e.response?.data?.message || "매장 등록에 실패했습니다"),
        })}
        isLoading={createStore.isPending}
      />
    );
  }

  const score = store?.competitiveScore ?? 0;
  const scoreColor = score >= 71 ? "text-emerald-500" : score >= 41 ? "text-amber-500" : "text-rose-500";
  const scoreBg = score >= 71 ? "from-emerald-500/10 to-emerald-500/5" : score >= 41 ? "from-amber-500/10 to-amber-500/5" : "from-rose-500/10 to-rose-500/5";
  const scoreRing = score >= 71 ? "border-emerald-500" : score >= 41 ? "border-amber-500" : "border-rose-500";
  const kwList = keywords ?? [];
  const compList = competitors ?? [];

  // 상승/하락 키워드 수
  const upCount = kwList.filter((k: any) => k.trendDirection === "UP").length;
  const downCount = kwList.filter((k: any) => k.trendDirection === "DOWN").length;

  return (
    <div className="space-y-5 md:space-y-6 max-w-5xl mx-auto">
      {/* 환영 메시지 */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">
          {store?.name ? `${store.name}` : "대시보드"}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {store?.address || "AI가 매장 마케팅을 분석하고 있습니다"}
        </p>
      </div>

      {/* 오늘 장사 브리핑 */}
      <TodayBriefingCard
        briefing={briefing ?? null}
        isLoading={generateBriefing.isPending}
        onGenerate={() => generateBriefing.mutate(undefined, {
          onSuccess: () => toast.success("브리핑이 생성되었습니다!"),
          onError: (e: any) => toast.error(e.response?.data?.message || "브리핑 생성에 실패했습니다"),
        })}
      />

      {/* 핵심 지표 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 경쟁력 점수 */}
        <Card className="overflow-hidden">
          <CardContent className={`pt-4 pb-3 px-4 bg-gradient-to-br ${scoreBg}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">경쟁력 점수</span>
              <Trophy size={14} className={scoreColor} />
            </div>
            <div className="flex items-end gap-1">
              <span className={`text-3xl font-extrabold ${scoreColor}`}>{score || "-"}</span>
              <span className="text-xs text-muted-foreground mb-1">/100</span>
            </div>
          </CardContent>
        </Card>

        {/* 추적 키워드 */}
        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">추적 키워드</span>
              <Search size={14} className="text-blue-500" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-extrabold">{kwList.length}</span>
              <span className="text-xs text-muted-foreground mb-1">개</span>
            </div>
            {(upCount > 0 || downCount > 0) && (
              <div className="flex gap-2 mt-1.5">
                {upCount > 0 && <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-0.5"><TrendingUp size={10} />{upCount} 상승</span>}
                {downCount > 0 && <span className="text-[11px] text-rose-500 font-medium flex items-center gap-0.5"><TrendingDown size={10} />{downCount} 하락</span>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 경쟁 매장 */}
        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-rose-500/10 to-rose-500/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">경쟁 매장</span>
              <Users size={14} className="text-rose-500" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-extrabold">{compList.length}</span>
              <span className="text-xs text-muted-foreground mb-1">개</span>
            </div>
          </CardContent>
        </Card>

        {/* 대표 키워드 */}
        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-violet-500/10 to-violet-500/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">대표 키워드</span>
              <Star size={14} className="text-violet-500" />
            </div>
            {kwList.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {kwList.slice(0, 3).map((kw: any, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px] bg-violet-100 text-violet-700 border-0">{kw.keyword}</Badge>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground mt-1">-</p>}
          </CardContent>
        </Card>
      </div>

      {/* 순위 변동 차트 */}
      {kwList.length > 0 && (
        <RankHistoryChart
          data={rankData ?? []}
          keywords={kwList.slice(0, 3).map((k: any) => k.keyword)}
          isLoading={false}
        />
      )}

      {/* 빠른 액션 */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">빠른 액션</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "AI 브리핑",
              desc: "오늘 할 일 받기",
              icon: Sparkles,
              gradient: "from-blue-500 to-indigo-600",
              onClick: () => generateBriefing.mutate(undefined, {
                onSuccess: () => toast.success("브리핑 생성 완료!"),
                onError: (e: any) => toast.error("브리핑 생성 실패: " + (e.response?.data?.message || e.message)),
              }),
            },
            {
              label: "콘텐츠 생성",
              desc: "블로그/SNS 글쓰기",
              icon: FileText,
              gradient: "from-purple-500 to-pink-500",
              onClick: () => router.push("/content"),
            },
            {
              label: "키워드 관리",
              desc: "순위 체크하기",
              icon: Search,
              gradient: "from-emerald-500 to-teal-500",
              onClick: () => router.push("/keywords"),
            },
            {
              label: "매장 분석",
              desc: "AI 종합 분석",
              icon: BarChart3,
              gradient: "from-orange-500 to-red-500",
              onClick: () => router.push("/analysis"),
            },
          ].map((action) => (
            <Card
              key={action.label}
              className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden group"
              onClick={action.onClick}
            >
              <CardContent className="pt-4 pb-3 px-4">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-3 shadow-md group-hover:shadow-lg transition-shadow`}>
                  <action.icon size={18} className="text-white" />
                </div>
                <p className="text-sm font-semibold">{action.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  {action.desc}
                  <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

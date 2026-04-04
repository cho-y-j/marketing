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

  // 토큰 없으면 로그인으로
  if (!hasToken && typeof window !== "undefined") {
    router.push("/login");
    return null;
  }

  // 로딩
  if (storesLoading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // 매장 없으면 온보딩
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
  const scoreColor = score >= 71 ? "text-green-500" : score >= 41 ? "text-yellow-500" : "text-red-500";
  const kwList = keywords ?? [];
  const compList = competitors ?? [];

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl">
      {/* 오늘 장사 브리핑 */}
      <TodayBriefingCard
        briefing={briefing ?? null}
        isLoading={generateBriefing.isPending}
        onGenerate={() => generateBriefing.mutate(undefined, {
          onSuccess: () => toast.success("브리핑이 생성되었습니다!"),
          onError: (e: any) => toast.error(e.response?.data?.message || "브리핑 생성에 실패했습니다"),
        })}
      />

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">경쟁력 점수</span>
            </div>
            <p className={`text-2xl font-bold ${scoreColor}`}>
              {score || "-"}<span className="text-xs font-normal text-muted-foreground">/100</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Search size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">추적 키워드</span>
            </div>
            <p className="text-2xl font-bold">{kwList.length}개</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">경쟁 매장</span>
            </div>
            <p className="text-2xl font-bold">{compList.length}개</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Star size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">대표 키워드</span>
            </div>
            {kwList.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {kwList.slice(0, 2).map((kw: any, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{kw.keyword}</Badge>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">-</p>}
          </CardContent>
        </Card>
      </div>

      {/* 순위 변동 차트 — 실데이터 연결 */}
      <RankHistoryChart
        data={rankData ?? []}
        keywords={kwList.slice(0, 3).map((k: any) => k.keyword)}
        isLoading={false}
      />

      {/* 빠른 액션 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
          generateBriefing.mutate(undefined, {
            onSuccess: () => toast.success("브리핑 생성 완료!"),
            onError: (e: any) => toast.error("브리핑 생성 실패: " + (e.response?.data?.message || e.message)),
          });
        }}>
          <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-blue-500"><Sparkles size={18} /></div>
            <span className="text-sm font-medium">브리핑 생성</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/content")}>
          <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-purple-500"><FileText size={18} /></div>
            <span className="text-sm font-medium">콘텐츠 생성</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/keywords")}>
          <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-green-500"><Search size={18} /></div>
            <span className="text-sm font-medium">키워드 관리</span>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/analysis")}>
          <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-orange-500"><BarChart3 size={18} /></div>
            <span className="text-sm font-medium">매장 분석</span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

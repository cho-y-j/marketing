"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { SetupProgressCard } from "@/components/dashboard/setup-progress-card";
import { SetupProgressRing } from "@/components/dashboard/setup-progress-ring";
import { IngredientAlertBar } from "@/components/dashboard/ingredient-alert-bar";
import { SalesMissingAlert } from "@/components/dashboard/sales-missing-alert";
import { HeroDiagnosis } from "@/components/dashboard/hero-diagnosis";
import { TodayActions } from "@/components/dashboard/today-actions";
import { KeywordCarousel } from "@/components/dashboard/keyword-carousel";
import { YesterdaySummary } from "@/components/dashboard/yesterday-summary";
import { QuickGrid } from "@/components/dashboard/quick-grid";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useCreateStore } from "@/hooks/useStore";
import { useDashboard } from "@/hooks/useDashboard";
import { toast } from "sonner";

/**
 * 홈 — 5섹션 구성 (DESIGN-apple §10 + 사장님 룰).
 *
 *   § 1. HeroDiagnosis        매장 + 한 문장 진단 + 평균 순위
 *   § 2. TodayActions         오늘 1순위 큰 카드 + 보조 2~3
 *   § 3. KeywordCarousel      키워드 가로 스크롤
 *   § 4. YesterdaySummary     어제 매출/리뷰/경쟁 한 줄씩
 *   § 5. QuickGrid            4칸 라인 아이콘 진입
 *
 * 룰:
 *  - 이모지 0, 색배지 0, 컬러 일러스트 0
 *  - 단일 액센트(brand 파랑) — CTA + 좋아짐 변화에만
 *  - 섹션 간격 32~48px, 카드 패딩 16~20px
 */
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
      <div className="space-y-8 max-w-3xl mx-auto px-4 md:px-6 py-6">
        <Skeleton className="h-32 rounded-none" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
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
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
        <SetupProgressCard storeId={storeId} />
      </div>
    );
  }

  if (dashLoading || !dashboard) {
    return (
      <div className="space-y-8 max-w-3xl mx-auto px-4 md:px-6 py-6">
        <Skeleton className="h-32 rounded-none" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  const d = dashboard as any;
  const {
    store,
    status,
    actions,
    myWeeklyGrowth,
    keywordRanks,
    competitorActions,
  } = d;

  // 평균 순위 변화 = 키워드별 (currentRank - previousRank) 평균.
  // 음수 = 좋아짐 (사장님 룰).
  const ranksWithBoth = (keywordRanks ?? []).filter(
    (k: any) => k.currentRank != null && k.previousRank != null,
  );
  const avgRankChange =
    ranksWithBoth.length > 0
      ? Math.round(
          ranksWithBoth.reduce(
            (s: number, k: any) => s + (k.currentRank - k.previousRank),
            0,
          ) / ranksWithBoth.length,
        )
      : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 pb-12">
      {/* 셋업 진행 — 조건부 */}
      {d.setupProgress && (
        <div className="pt-4">
          <SetupProgressRing progress={d.setupProgress} />
        </div>
      )}
      {storeId && <SetupProgressCard storeId={storeId} />}

      {/* 슬림 알림 바 — 조건부 */}
      {(storeId) && (
        <div className="pt-4 space-y-2 empty:hidden">
          <SalesMissingAlert storeId={storeId} />
          <IngredientAlertBar storeId={storeId} />
        </div>
      )}

      {/* § 1. 종합 진단 */}
      <HeroDiagnosis
        storeName={store.name}
        address={store.address}
        avgRank={status?.avgRank ?? null}
        avgRankChange={avgRankChange}
        visitorDelta={myWeeklyGrowth?.visitor ?? null}
        blogDelta={myWeeklyGrowth?.blog ?? null}
      />

      <div className="space-y-10 md:space-y-12">
        {/* § 2. 오늘 해야 할 일 */}
        {actions?.length > 0 && <TodayActions actions={actions} />}

        {/* § 3. 키워드 */}
        {keywordRanks?.length > 0 && <KeywordCarousel keywords={keywordRanks} />}

        {/* § 4. 이번 주 흐름 + 경쟁 액션 */}
        <YesterdaySummary
          storeId={storeId}
          myWeeklyGrowth={myWeeklyGrowth}
          competitorActions={competitorActions}
        />

        {/* § 5. 빠른 이동 */}
        <QuickGrid />
      </div>
    </div>
  );
}

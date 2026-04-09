"use client";

import { useStores } from "@/hooks/useStore";
import { useActiveStore } from "@/hooks/useActiveStore";
import { useEffect } from "react";

/**
 * 현재 활성 매장 ID를 반환하는 공통 훅
 * 모든 페이지에서 이 훅을 사용하여 매장 전환이 일관되게 작동
 */
export function useCurrentStoreId(): {
  storeId: string;
  stores: any[];
  isLoading: boolean;
  hasStores: boolean;
  hasToken: boolean;
} {
  const { data: stores, isLoading } = useStores();
  const { activeStoreId, setActiveStoreId } = useActiveStore();

  const hasToken = typeof window !== "undefined" && !!localStorage.getItem("token");

  // 활성 매장 유효성 검사:
  //  - 활성 매장 ID 가 유효하지 않으면 (없거나 stale) 첫 매장으로 자동 선택
  //  - 사용자가 store-switcher 로 명시적으로 바꾸면 그게 우선
  //  - 매장이 0개면 클리어
  // → 다매장 환경에서도 항상 한 매장은 활성 (빈 화면 방지). 전환은 store-switcher UI 로
  useEffect(() => {
    if (!stores) return;
    if (stores.length === 0) {
      if (activeStoreId) setActiveStoreId("");
      return;
    }
    const valid = stores.find((s: any) => s.id === activeStoreId);
    if (!valid) {
      setActiveStoreId(stores[0].id);
    }
  }, [stores, activeStoreId, setActiveStoreId]);

  // storeId 결정: zustand 활성 매장 → 첫 매장 폴백 (useEffect 가 동기화하기 전 첫 렌더용)
  const storeId =
    stores?.find((s: any) => s.id === activeStoreId)?.id ||
    stores?.[0]?.id ||
    "";

  return {
    storeId,
    stores: stores ?? [],
    isLoading,
    hasStores: (stores?.length ?? 0) > 0,
    hasToken,
  };
}

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

  // 활성 매장이 없거나 유효하지 않으면 첫 번째 매장으로 설정
  useEffect(() => {
    if (stores && stores.length > 0) {
      const valid = stores.find((s: any) => s.id === activeStoreId);
      if (!valid) {
        setActiveStoreId(stores[0].id);
      }
    }
  }, [stores, activeStoreId, setActiveStoreId]);

  const storeId = activeStoreId || stores?.[0]?.id || "";

  return {
    storeId,
    stores: stores ?? [],
    isLoading,
    hasStores: (stores?.length ?? 0) > 0,
    hasToken,
  };
}

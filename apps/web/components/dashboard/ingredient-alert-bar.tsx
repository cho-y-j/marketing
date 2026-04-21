"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * 주재료 가격 급등 시에만 표시되는 슬림 알림 바.
 * 알림 없으면 렌더링 안 함.
 */
export function IngredientAlertBar({ storeId }: { storeId?: string }) {
  const { data } = useQuery<{ items: any[]; alerts: any[] }>({
    queryKey: ["ingredient-prices", storeId],
    queryFn: () =>
      apiClient.get(`/stores/${storeId}/ingredients/prices`).then((r) => r.data),
    enabled: !!storeId,
  });

  if (!data || !data.alerts || data.alerts.length === 0) return null;
  const top = data.alerts[0];
  const severe = top.alertType === "MONTHLY_20";

  return (
    <Link
      href="/ingredients"
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs hover:shadow-sm transition-shadow ${
        severe
          ? "bg-red-50 border-red-200 text-red-900"
          : "bg-amber-50 border-amber-200 text-amber-900"
      }`}
    >
      <AlertTriangle size={14} className="shrink-0" />
      <span className="flex-1 font-medium truncate">{top.message}</span>
      {data.alerts.length > 1 && (
        <span className="shrink-0 text-[10px] font-semibold bg-white/60 px-1.5 py-0.5 rounded">
          +{data.alerts.length - 1}
        </span>
      )}
      <ArrowRight size={12} className="shrink-0 opacity-60" />
    </Link>
  );
}

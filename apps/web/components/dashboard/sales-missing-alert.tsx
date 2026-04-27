"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Receipt, ArrowRight } from "lucide-react";
import { SalesInputModal } from "@/components/reports/sales-input-modal";

/**
 * 매출 미입력 알림 바.
 *
 * 노출 조건 (사장님 룰):
 *  - 오늘이 미입력 + 현재 시각 21시 이후 → 노출
 *  - 또는 최근 7일 중 미입력이 3일 이상 → 노출 (catch-up)
 *  - 그 외엔 렌더링 안 함 (메인을 매출 수동 입력으로 도배 X)
 *
 * 클릭 → SalesInputModal 오픈 (오늘 날짜).
 */
export function SalesMissingAlert({ storeId }: { storeId?: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const { data } = useQuery<{ days: number; missing: string[] }>({
    queryKey: ["sales-missing", storeId],
    queryFn: () =>
      apiClient.get(`/stores/${storeId}/sales/missing?days=7`).then((r) => r.data),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  if (!storeId || !data) return null;

  const missing = data.missing ?? [];
  const todayMissing = missing.includes(today);
  const hour = new Date().getHours();
  const lateAndTodayMissing = todayMissing && hour >= 21;
  const catchUp = missing.length >= 3;

  if (!lateAndTodayMissing && !catchUp) return null;

  const message = lateAndTodayMissing
    ? "오늘 매출 입력 안 했어요"
    : `최근 ${missing.length}일 매출이 비어있어요`;

  const subtle = !lateAndTodayMissing;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex w-full items-center gap-2 px-3 py-2 rounded-lg border text-xs hover:shadow-sm transition-shadow ${
          subtle
            ? "bg-amber-50 border-amber-200 text-amber-900"
            : "bg-emerald-50 border-emerald-200 text-emerald-900"
        }`}
      >
        <Receipt size={14} className="shrink-0" />
        <span className="flex-1 text-left font-medium truncate">{message}</span>
        <span className="shrink-0 text-[11px] font-semibold bg-white/60 px-2 py-0.5 rounded">
          1탭 입력
        </span>
        <ArrowRight size={12} className="shrink-0 opacity-60" />
      </button>
      {open && (
        <SalesInputModal
          storeId={storeId}
          date={today}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

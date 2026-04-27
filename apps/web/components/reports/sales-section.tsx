"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { CARD_BASE } from "@/lib/design-system";
import { DollarSign, Plus, TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SalesInputModal } from "./sales-input-modal";

/**
 * 매출 섹션 — 일/주/월 토글 + 막대 차트 + 마케팅 활동 마커 + AI ROI 인사이트.
 *
 * 사장님 룰:
 *  - 캐시노트는 자동 매출만 보여줌. 우리는 매출 + 마케팅 활동 매칭으로 차별화.
 *  - "광고 후 매출 +N%" 가 7만원/월 명분.
 *  - DESIGN-apple §10 — Paperlogy 상속, break-keep, 8px radius, 회색 단색
 */

type Period = "day" | "week" | "month";

type SalesPoint = {
  label: string;
  total: number;
  card: number;
  cash: number;
  note?: string | null;
};

type RoiResp = {
  insight: string;
  weeklyChange: { current: number; previous: number; deltaPct: number | null } | null;
  triggers: Array<{ date: string; type: string; label: string }>;
} | null;

const PERIOD_LABEL: Record<Period, string> = {
  day: "일별 (최근 30일)",
  week: "주별 (최근 12주)",
  month: "월별 (최근 12개월)",
};

export function SalesSection({ storeId }: { storeId?: string }) {
  const [period, setPeriod] = useState<Period>("day");
  const [inputOpen, setInputOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery<{ period: Period; points: SalesPoint[] }>({
    queryKey: ["sales", storeId, period],
    queryFn: () =>
      apiClient.get(`/stores/${storeId}/sales?period=${period}`).then((r) => r.data),
    enabled: !!storeId,
  });

  const { data: roi } = useQuery<RoiResp>({
    queryKey: ["sales-roi", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/sales/roi`).then((r) => r.data),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  const points = data.points;
  const max = Math.max(...points.map((p) => p.total), 1);
  const total = points.reduce((s, p) => s + p.total, 0);
  const filledCount = points.filter((p) => p.total > 0).length;

  return (
    <div className="space-y-3">
      {/* 헤더 — 통계 + 입력 버튼 */}
      <div className={`${CARD_BASE} break-keep`}>
        <div className="p-4 md:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                <DollarSign size={18} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">매출 성과</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  영수증 사진 또는 숫자 직접 입력
                </p>
              </div>
            </div>
            <button
              onClick={() => setInputOpen(true)}
              className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-md bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700"
            >
              <Plus size={12} /> 매출 입력
            </button>
          </div>

          {/* 기간 토글 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">기간</span>
            {(["day", "week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 min-h-[36px] text-[12px] rounded-md border transition-colors font-medium ${
                  period === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white hover:bg-muted/50 border-border"
                }`}
              >
                {p === "day" ? "일별" : p === "week" ? "주별" : "월별"}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {PERIOD_LABEL[period]} · 입력 {filledCount}건 / 합계 {formatWon(total)}
            </span>
          </div>

          {/* 막대 차트 — 마커 포함 */}
          {filledCount > 0 ? (
            <BarChart points={points} max={max} period={period} />
          ) : (
            <div className="text-center py-8 text-xs text-muted-foreground">
              아직 매출 입력이 없어요.{" "}
              <button
                onClick={() => setInputOpen(true)}
                className="text-emerald-600 font-bold underline"
              >
                지금 첫 매출 입력하기
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI 마케팅 ROI 인사이트 */}
      {roi && roi.weeklyChange && (
        <div
          className={`${CARD_BASE} break-keep border ${
            roi.weeklyChange.deltaPct != null && roi.weeklyChange.deltaPct > 0
              ? "border-emerald-200"
              : roi.weeklyChange.deltaPct != null && roi.weeklyChange.deltaPct < 0
                ? "border-red-200"
                : ""
          }`}
        >
          <div className="p-4 md:p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-brand" />
              <span className="text-xs font-bold text-foreground">AI 마케팅 ROI 인사이트</span>
              {roi.weeklyChange.deltaPct != null && (
                <span
                  className={`ml-auto inline-flex items-center gap-0.5 text-xs font-bold ${
                    roi.weeklyChange.deltaPct > 0
                      ? "text-blue-600"
                      : roi.weeklyChange.deltaPct < 0
                        ? "text-red-600"
                        : "text-muted-foreground"
                  }`}
                >
                  {roi.weeklyChange.deltaPct > 0 ? (
                    <TrendingUp size={12} />
                  ) : roi.weeklyChange.deltaPct < 0 ? (
                    <TrendingDown size={12} />
                  ) : (
                    <Minus size={12} />
                  )}
                  {roi.weeklyChange.deltaPct > 0 ? "+" : ""}
                  {roi.weeklyChange.deltaPct}%
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-foreground">{roi.insight}</p>
            {roi.triggers.length > 0 && (
              <div className="pt-2 border-t border-border/60">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">최근 마케팅 활동</p>
                <ul className="space-y-0.5">
                  {roi.triggers.slice(0, 4).map((t, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className="text-foreground/60">{t.date}</span>
                      <span>·</span>
                      <span>{t.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {inputOpen && (
        <SalesInputModal
          storeId={storeId!}
          date={today}
          onClose={() => setInputOpen(false)}
        />
      )}
    </div>
  );
}

function BarChart({ points, max, period }: { points: SalesPoint[]; max: number; period: Period }) {
  const isLong = points.length > 12;
  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-[3px] h-24 md:h-28">
        {points.map((p, i) => {
          const h = Math.max(2, Math.round((p.total / max) * (period === "day" ? 96 : 112)));
          const isToday = period === "day" && i === points.length - 1;
          return (
            <div key={p.label} className="flex-1 relative group" title={`${p.label}: ${formatWon(p.total)}${p.note ? ` — ${p.note}` : ""}`}>
              <div
                className={`w-full rounded-t-sm ${
                  p.total === 0
                    ? "bg-muted"
                    : isToday
                      ? "bg-emerald-600"
                      : "bg-emerald-300"
                }`}
                style={{ height: `${h}px` }}
              />
              {/* 마케팅 활동 마커 */}
              {p.note && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-amber-500" title={p.note} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{points[0]?.label}</span>
        {!isLong &&
          points.length > 5 &&
          points.length < 14 &&
          points
            .slice(1, -1)
            .filter((_, i) => i % Math.ceil(points.length / 6) === 0)
            .map((p) => <span key={p.label} className="hidden md:inline">{p.label.slice(5)}</span>)}
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function formatWon(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만원`;
  return `${n.toLocaleString()}원`;
}

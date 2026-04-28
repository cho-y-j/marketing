"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, FileEdit, Megaphone, Sparkles } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { SalesInputModal } from "@/components/reports/sales-input-modal";

type CompetitorAction = {
  title: string;
  reason: string;
  ctaLabel: string;
  href: string;
  severity: "info" | "warning" | "critical";
};

/**
 * § 4. 이번 주 흐름 — 매출/리뷰 한 줄 + 경쟁 액션 카드.
 *
 * 사장님 룰 (보여주기 X 해주기):
 *  - 단순 차이만 표시 X — "왜 + 어떻게" 같이
 *  - 경쟁 액션은 차이 → 원인 → 1탭 실행
 */
export function YesterdaySummary({
  storeId,
  myWeeklyGrowth,
  competitorActions,
}: {
  storeId?: string;
  myWeeklyGrowth?: { visitor: number | null; blog: number | null } | null;
  competitorActions?: CompetitorAction[];
}) {
  const router = useRouter();
  const [salesOpen, setSalesOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: missing } = useQuery<{ days: number; missing: string[] }>({
    queryKey: ["sales-missing-y", storeId],
    queryFn: () =>
      apiClient.get(`/stores/${storeId}/sales/missing?days=2`).then((r) => r.data),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const yesterdayMissing = missing?.missing.includes(yesterday) ?? false;
  const visitorDelta = myWeeklyGrowth?.visitor ?? null;
  const blogDelta = myWeeklyGrowth?.blog ?? null;

  const showSales = !!storeId;
  const showReview = visitorDelta != null || blogDelta != null;
  const showCompActions = (competitorActions?.length ?? 0) > 0;

  if (!showSales && !showReview && !showCompActions) return null;

  return (
    <section>
      <p className="mb-3 px-1 text-[10px] font-semibold tracking-wider text-text-tertiary uppercase">
        이번 주 흐름
      </p>

      {/* 매출 + 리뷰 한 줄 (단순 정보) */}
      {(showSales || showReview) && (
        <ul className="rounded-2xl bg-surface border border-border-primary divide-y divide-border-primary overflow-hidden">
          {showSales && (
            <li>
              <button
                onClick={() => setSalesOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-tertiary transition-colors min-h-[52px]"
              >
                <span className="text-sm font-medium text-text-primary w-12 text-left">매출</span>
                <span className="flex-1 text-left text-sm text-text-secondary truncate">
                  {yesterdayMissing ? "어제 입력이 비어있어요" : "최근 입력 정상"}
                </span>
                {yesterdayMissing && (
                  <span className="text-xs text-brand font-semibold">입력</span>
                )}
                <ChevronRight size={16} className="text-text-tertiary shrink-0" />
              </button>
            </li>
          )}
          {showReview && (
            <li>
              <button
                onClick={() => router.push("/reviews")}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-tertiary transition-colors min-h-[52px]"
              >
                <span className="text-sm font-medium text-text-primary w-12 text-left">리뷰</span>
                <span className="flex-1 text-left text-sm text-text-secondary">
                  <span className="tabular-nums">방문 {fmt(visitorDelta)}</span>
                  <span className="text-text-tertiary mx-1.5">·</span>
                  <span className="tabular-nums">블로그 {fmt(blogDelta)}</span>
                </span>
                <ChevronRight size={16} className="text-text-tertiary shrink-0" />
              </button>
            </li>
          )}
        </ul>
      )}

      {/* 경쟁 액션 카드 — 차이 + 원인 + 1탭 실행 */}
      {showCompActions && (
        <div className="mt-3 space-y-2">
          {competitorActions!.map((a, i) => (
            <CompetitorActionCard key={i} action={a} />
          ))}
        </div>
      )}

      {salesOpen && storeId && (
        <SalesInputModal
          storeId={storeId}
          date={yesterdayMissing ? yesterday : today}
          onClose={() => setSalesOpen(false)}
        />
      )}
    </section>
  );
}

function CompetitorActionCard({ action }: { action: CompetitorAction }) {
  const isReview = action.href.includes("/reviews");
  if (isReview) return <ReviewActionCard action={action} />;
  return <SimpleActionCard action={action} />;
}

/** 리뷰 카드 — book.png 좌측 고정 너비 + 텍스트 우측 flex */
function ReviewActionCard({ action }: { action: CompetitorAction }) {
  return (
    <div
      className="overflow-hidden rounded-3xl border border-border-primary"
      style={{
        background:
          "linear-gradient(135deg, #f5ecff 0%, #fbf2ff 40%, #fff7e6 100%)",
      }}
    >
      <div className="flex items-stretch min-h-[180px] md:min-h-[200px]">
        {/* 좌측 일러스트 — 고정 너비. 카드 가로 커져도 늘어나지 않음 */}
        <div className="relative w-[160px] md:w-[200px] shrink-0 pointer-events-none select-none">
          <Image
            src="/illustrations/review.png"
            alt=""
            fill
            sizes="200px"
            className="object-contain object-center p-2"
          />
        </div>

        {/* 우측 텍스트 + CTA — flex-1, 카드 가로 늘어나도 텍스트가 자연 줄바꿈 */}
        <div className="flex-1 min-w-0 py-5 pr-5 pl-2 flex flex-col justify-center">
          <p className="text-sm font-semibold text-text-primary break-keep">
            {action.title}
          </p>
          <p className="mt-1.5 text-xs text-text-secondary leading-relaxed break-keep line-clamp-3">
            {action.reason}
          </p>
          <Link href={action.href} className="inline-flex mt-3 self-start">
            <button className="h-9 px-4 rounded-lg bg-brand text-white text-[12px] font-semibold hover:bg-brand-dark transition-colors inline-flex items-center gap-1">
              <Sparkles size={12} />
              <span>{action.ctaLabel}</span>
              <ChevronRight size={13} />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** 그 외 (블로그 등) — 단순 카드 + lucide 아이콘 */
function SimpleActionCard({ action }: { action: CompetitorAction }) {
  const isContent = action.href.includes("/content");
  const Icon = isContent ? FileEdit : Megaphone;
  return (
    <div className="rounded-2xl bg-surface border border-border-primary p-4">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-xl bg-surface-secondary flex items-center justify-center shrink-0">
          <Icon size={18} strokeWidth={1.6} className="text-text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary break-keep">
            {action.title}
          </p>
          <p className="mt-1 text-xs text-text-secondary leading-relaxed break-keep">
            {action.reason}
          </p>
        </div>
      </div>
      <Link href={action.href} className="inline-flex mt-3">
        <button className="h-10 px-5 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-dark transition-colors inline-flex items-center gap-1.5">
          <Sparkles size={13} />
          {action.ctaLabel}
          <ChevronRight size={14} />
        </button>
      </Link>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

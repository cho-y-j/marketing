"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * § 1. 종합 진단 — 매장 정체성 + 한 줄 dense 통계.
 *
 * 룰 (사장님 결정):
 *  - 시각 메인은 § 2 Hero 카드 → 진단은 평문 헤더로 짧게
 *  - 카드 X. 매장명 큼 + 한 줄 통계 + 톤 한 줄
 *  - 약점 키워드 X. 추세/흐름 중심.
 *  - 이모지·색배지 0
 */
export function HeroDiagnosis({
  storeName,
  address,
  avgRank,
  avgRankChange, // 음수 = 좋아짐
  visitorDelta,
  blogDelta,
}: {
  storeName: string;
  address?: string | null;
  avgRank: number | null;
  avgRankChange: number;
  visitorDelta: number | null;
  blogDelta: number | null;
}) {
  const tone = makeTone(avgRankChange, visitorDelta, blogDelta);
  const shortAddr = shortenAddress(address);

  return (
    <section className="px-1 pt-3 pb-5">
      <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-text-primary leading-tight">
        {storeName}
      </h1>

      {/* 한 줄 dense 통계 */}
      <div className="mt-2.5 flex items-center flex-wrap gap-x-2 gap-y-1 text-sm">
        {shortAddr && (
          <>
            <span className="text-text-secondary">{shortAddr}</span>
            <Dot />
          </>
        )}
        {avgRank != null && (
          <>
            <span className="inline-flex items-baseline gap-0.5 text-text-primary">
              <span className="font-semibold tabular-nums">{avgRank}</span>
              <span className="text-text-tertiary text-xs">위</span>
              {avgRankChange !== 0 && <RankChangeInline change={avgRankChange} />}
            </span>
            <Dot />
          </>
        )}
        {visitorDelta != null && (
          <>
            <span className="text-text-secondary tabular-nums">
              방문 <span className="font-semibold text-text-primary">{fmt(visitorDelta)}</span>
            </span>
            <Dot />
          </>
        )}
        {blogDelta != null && (
          <span className="text-text-secondary tabular-nums">
            블로그 <span className="font-semibold text-text-primary">{fmt(blogDelta)}</span>
          </span>
        )}
      </div>

      {tone && (
        <p className="mt-2.5 text-sm font-medium text-text-primary">
          {tone}
        </p>
      )}
    </section>
  );
}

function Dot() {
  return <span className="text-text-tertiary text-xs">·</span>;
}

function RankChangeInline({ change }: { change: number }) {
  if (change < 0) {
    return (
      <span className="ml-1 inline-flex items-center text-xs font-semibold text-brand">
        <ArrowDown size={11} />
        {Math.abs(change)}
      </span>
    );
  }
  return (
    <span className="ml-1 inline-flex items-center text-xs font-semibold text-text-secondary">
      <ArrowUp size={11} />
      {change}
    </span>
  );
}

function fmt(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

function makeTone(
  rankChange: number,
  visitor: number | null,
  blog: number | null,
): string | null {
  const reviewSum = (visitor ?? 0) + (blog ?? 0);
  if (rankChange < -2 || reviewSum >= 8) return "지난 7일 좋은 흐름이에요";
  if (rankChange < 0 || reviewSum >= 3) return "꾸준하게 가고 있어요";
  if (rankChange === 0 && reviewSum === 0) return null;
  return "안정적으로 유지 중이에요";
}

function shortenAddress(addr?: string | null): string | null {
  if (!addr) return null;
  // "충청북도 청주시 흥덕구 가경동 ..." → "청주시 흥덕구 가경동"
  const parts = addr.split(/\s+/);
  if (parts.length <= 2) return addr;
  // 시/구/동 만 추출
  const keep = parts.filter((p) => /시$|구$|동$|읍$|면$/.test(p));
  return keep.length > 0 ? keep.slice(0, 3).join(" ") : parts.slice(0, 3).join(" ");
}

"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";

type Keyword = {
  keyword: string;
  currentRank: number | null;
  change: number | null;
};

/**
 * § 3. 키워드 가로 스크롤.
 *
 * 룰:
 *  - 카드 한 장 = 키워드명(작게) + 큰 순위 + 변화만
 *  - 색은 변화 화살표에만 (좋아짐=brand 파랑, 나빠짐=text-secondary)
 *  - 이모지 0
 */
export function KeywordCarousel({ keywords }: { keywords: Keyword[] }) {
  if (!keywords || keywords.length === 0) return null;

  return (
    <section>
      <div className="flex items-end justify-between mb-3 px-1">
        <p className="text-[10px] font-semibold tracking-wider text-text-tertiary uppercase">
          내 키워드 {keywords.length}개
        </p>
        <Link
          href="/keywords"
          className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-0.5"
        >
          전체 보기
          <ChevronRight size={12} />
        </Link>
      </div>

      <div className="-mx-4 md:mx-0 px-4 md:px-0 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2.5 pb-1">
          {keywords.map((k) => (
            <KeywordTile key={k.keyword} kw={k} />
          ))}
        </div>
      </div>
    </section>
  );
}

function KeywordTile({ kw }: { kw: Keyword }) {
  const rank = kw.currentRank;
  const change = kw.change ?? 0;
  return (
    <Link
      href={`/keywords/${encodeURIComponent(kw.keyword)}`}
      className="shrink-0 w-[112px] rounded-2xl bg-surface border border-border-primary p-3.5 hover:border-text-tertiary/30 transition-colors"
    >
      <p className="text-[11px] text-text-secondary font-medium truncate min-h-[14px]">
        {kw.keyword}
      </p>
      <p className="mt-2.5 text-2xl font-bold tracking-tight text-text-primary tabular-nums">
        {rank == null ? "—" : rank > 70 ? "70+" : `${rank}`}
        {rank != null && rank <= 70 && (
          <span className="text-xs font-medium text-text-tertiary ml-0.5">위</span>
        )}
      </p>
      <div className="mt-2 h-4 flex items-center text-[11px] tabular-nums">
        {change === 0 || change == null ? (
          <span className="text-text-tertiary">변동 없음</span>
        ) : change < 0 ? (
          <span className="inline-flex items-center gap-0.5 text-brand font-semibold">
            <ArrowDown size={11} />
            {Math.abs(change)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-text-secondary font-semibold">
            <ArrowUp size={11} />
            {change}
          </span>
        )}
      </div>
    </Link>
  );
}

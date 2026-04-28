"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Clock, TrendingUp } from "lucide-react";

type Action = {
  type: string;
  title: string;
  description?: string;
  reason?: string;
  expectedEffect?: string;
  estimatedMinutes?: number;
  href?: string;
};

/**
 * § 2. 오늘 해야 할 일 — Hero(1순위) + 보조 2~3.
 *
 * Hero 카드 (장사닥터 셰프 패턴):
 *  - 카드 자체가 첫 viewport 의 메인 시각 요소
 *  - 좌측 절반: 라벨 → 제목 → 이유 → 메타 → CTA
 *  - 우측 절반: 큰 일러스트 (180~220px). 카드 우측 살짝 넘치게도 OK
 *  - 배경: 진한 보라/파랑 그라디언트 (이미지 톤과 일체)
 *  - 높이 280~320px (모바일에서도 임팩트)
 */
export function TodayActions({ actions }: { actions: Action[] }) {
  if (!actions || actions.length === 0) return null;
  const top = actions[0];
  if (!top) return null;
  const rest = actions.slice(1, 3);

  return (
    <section>
      <p className="mb-3 px-1 text-[10px] font-semibold tracking-wider text-text-tertiary uppercase">
        오늘 해야 할 일
      </p>

      {/* Hero 카드 — 큰 일러스트 + 진한 그라디언트 */}
      <div
        className="relative overflow-hidden rounded-3xl border border-border-primary"
        style={{
          background:
            "linear-gradient(135deg, #e8efff 0%, #ecebff 35%, #f5ecff 100%)",
        }}
      >
        {/* 우측 큰 일러스트 — 카드 절반 가까이 (투명 PNG 라 텍스트와 겹쳐도 자연스러움) */}
        <div className="absolute right-0 bottom-0 pointer-events-none select-none">
          <Image
            src="/illustrations/ai-pick.png"
            alt=""
            width={400}
            height={400}
            className="w-[240px] h-[240px] md:w-[300px] md:h-[300px] object-contain object-right-bottom"
            priority
          />
        </div>

        {/* 좌측 콘텐츠 — 일러스트와 텍스트 일부 겹치되 투명영역이라 자연스러움 */}
        <div className="relative p-6 pr-[150px] md:pr-[200px] min-h-[280px] md:min-h-[320px] flex flex-col">
          <p className="text-[11px] font-semibold text-brand">
            AI 추천 1순위
          </p>
          <h3 className="mt-2 text-xl md:text-[22px] font-bold tracking-tight text-text-primary leading-tight break-keep">
            {top.title}
          </h3>
          {top.reason && (
            <p className="mt-2.5 text-[13px] text-text-secondary leading-relaxed break-keep line-clamp-3">
              {top.reason}
            </p>
          )}

          <div className="flex-1" />

          {/* 메타 + CTA — 카드 하단 */}
          {(top.expectedEffect || top.estimatedMinutes) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-secondary">
              {top.estimatedMinutes != null && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Clock size={12} />약 {top.estimatedMinutes}분
                </span>
              )}
              {top.expectedEffect && (
                <span className="inline-flex items-center gap-1 truncate">
                  <TrendingUp size={12} className="shrink-0" />
                  <span className="truncate">{top.expectedEffect}</span>
                </span>
              )}
            </div>
          )}

          {top.href && (
            <Link href={top.href} className="inline-flex mt-4">
              <button className="h-10 px-5 rounded-lg bg-brand text-white text-[13px] font-semibold hover:bg-brand-dark transition-colors inline-flex items-center gap-1.5">
                시작하기
                <ChevronRight size={14} />
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* 2~3순위 한 줄 */}
      {rest.length > 0 && (
        <ul className="mt-3 rounded-2xl bg-surface border border-border-primary divide-y divide-border-primary overflow-hidden">
          {rest.map((a, i) => (
            <li key={i}>
              <Link
                href={a.href || "#"}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-tertiary transition-colors min-h-[52px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {a.title}
                  </p>
                  {(a.reason || a.estimatedMinutes != null) && (
                    <p className="text-[11px] text-text-tertiary truncate mt-0.5">
                      {a.estimatedMinutes != null && `약 ${a.estimatedMinutes}분`}
                      {a.estimatedMinutes != null && a.reason && " · "}
                      {a.reason}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="text-text-tertiary shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

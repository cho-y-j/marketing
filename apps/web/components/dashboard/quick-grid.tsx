"use client";

import Link from "next/link";
import { LineChart, Swords, FileEdit, LayoutGrid } from "lucide-react";

/**
 * § 5. 빠른 이동 4칸 — 라인 아이콘 + 텍스트만.
 *
 * 룰:
 *  - 컬러 일러스트 X. lucide stroke 아이콘만
 *  - 4칸 (자주 가는 곳). 그 외는 "더보기" → 하단 시트(MobileNav 더보기)
 *  - 이모지 0
 */
export function QuickGrid() {
  const items = [
    { href: "/analysis", icon: LineChart, label: "매장 분석" },
    { href: "/competitors", icon: Swords, label: "경쟁 비교" },
    { href: "/content", icon: FileEdit, label: "콘텐츠" },
    { href: "/reports", icon: LayoutGrid, label: "리포트" },
  ];
  return (
    <section>
      <p className="mb-3 px-1 text-[10px] font-semibold tracking-wider text-text-tertiary uppercase">
        빠른 이동
      </p>
      <div className="grid grid-cols-4 gap-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-surface border border-border-primary hover:border-text-tertiary/30 transition-colors min-h-[88px]"
          >
            <it.icon size={20} strokeWidth={1.5} className="text-text-secondary" />
            <span className="text-[11px] font-medium text-text-primary">
              {it.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

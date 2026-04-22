"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  MessageSquareText,
  Search,
  Settings,
  Menu,
  Swords,
  FileEdit,
  CalendarDays,
  FileBarChart,
  DollarSign,
  Globe,
  Shield,
  X,
  PlusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// 하단 네비 — 가장 자주 쓰는 5개. 나머지는 "더보기" 에서 전체 접근
const primaryTabs = [
  { href: "/", label: "홈", icon: LayoutDashboard },
  { href: "/keywords", label: "키워드", icon: Search },
  { href: "/competitors", label: "경쟁", icon: Swords },
  { href: "/reviews", label: "리뷰", icon: MessageSquareText },
];

// 더보기 시트에서 사이드바와 동일한 전체 메뉴 제공
const fullMenu = [
  {
    label: "내 매장 상태",
    items: [
      { href: "/analysis", label: "매장 분석", icon: BarChart3 },
      { href: "/competitors", label: "경쟁 비교", icon: Swords },
    ],
  },
  {
    label: "마케팅 실행",
    items: [
      { href: "/keywords", label: "키워드", icon: Search },
      { href: "/content", label: "콘텐츠", icon: FileEdit },
      { href: "/reviews", label: "리뷰 관리", icon: MessageSquareText },
      { href: "/events", label: "시즌 이벤트", icon: CalendarDays },
    ],
  },
  {
    label: "성과 확인",
    items: [
      { href: "/reports", label: "리포트", icon: FileBarChart },
      { href: "/ingredients", label: "원가 관리", icon: DollarSign },
      { href: "/foreign-market", label: "외국인 상권", icon: Globe },
    ],
  },
  {
    label: "기타",
    items: [
      { href: "/settings", label: "설정", icon: Settings },
      { href: "/admin/users", label: "관리자", icon: Shield },
      { href: "/stores/new", label: "매장 등록", icon: PlusCircle },
    ],
  },
];

export function MobileNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-xl border-t border-border-primary z-50 safe-area-pb">
        <div className="flex justify-around items-center h-16 px-1">
          {primaryTabs.map((tab) => {
            const isActive =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors min-w-[56px] min-h-[52px] justify-center",
                  isActive
                    ? "text-brand"
                    : "text-text-tertiary active:scale-95",
                )}
              >
                <div
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    isActive && "bg-brand-subtle",
                  )}
                >
                  <tab.icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-none",
                    isActive ? "font-semibold" : "font-medium",
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
          {/* 더보기 — 사이드바 전체 메뉴 접근 */}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl min-w-[56px] min-h-[52px] justify-center text-text-tertiary active:scale-95"
            aria-label="전체 메뉴"
          >
            <div className="p-1.5 rounded-lg">
              <Menu size={20} strokeWidth={1.8} />
            </div>
            <span className="text-[10px] leading-none font-medium">더보기</span>
          </button>
        </div>
      </nav>

      {/* 더보기 시트 — 사이드바 풀메뉴 */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl max-h-[85vh] overflow-y-auto safe-area-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-surface/95 backdrop-blur-xl flex items-center justify-between px-4 py-3 border-b border-border-primary">
              <h2 className="text-base font-bold">전체 메뉴</h2>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 -m-2 rounded-lg hover:bg-surface-tertiary"
                aria-label="닫기"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-5">
              {fullMenu.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-widest px-2 mb-2">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => {
                      const active =
                        item.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-3 rounded-xl border transition-colors min-h-[52px]",
                            active
                              ? "bg-brand-subtle border-brand/30 text-brand font-semibold"
                              : "bg-white border-border text-text-primary hover:bg-surface-tertiary",
                          )}
                        >
                          <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                          <span className="text-sm">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

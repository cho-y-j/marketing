"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Swords,
  Search,
  FileEdit,
  Settings,
  PlusCircle,
  Store,
  Sparkles,
  MessageSquareText,
  Crown,
  CalendarDays,
  FileBarChart,
  Shield,
  Globe,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "홈",
    items: [
      { href: "/", label: "오늘 해야 할 것", icon: LayoutDashboard },
    ],
  },
  {
    label: "내 매장 상태",
    items: [
      { href: "/analysis", label: "매장 분석", icon: BarChart3 },
      { href: "/competitors", label: "경쟁매장", icon: Swords },
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
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-[240px] flex-col border-r border-border-primary bg-surface h-screen sticky top-0">
      {/* 로고 */}
      <div className="px-4 py-4 border-b border-border-primary">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-text-primary">마케팅 AI</h1>
            <p className="text-[10px] text-text-tertiary leading-none">매장 마케팅 매니저</p>
          </div>
        </Link>
      </div>

      {/* 매장 등록 */}
      <div className="px-3 pt-4">
        <Link
          href="/stores/new"
          className="flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold bg-brand text-white hover:bg-brand-dark transition-colors"
        >
          <PlusCircle size={14} />
          매장 등록
        </Link>
      </div>

      {/* 그룹별 네비게이션 */}
      <nav className="flex-1 px-3 pt-3 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-widest px-3 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                      isActive
                        ? "bg-brand-subtle text-brand font-semibold"
                        : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary font-medium",
                    )}
                  >
                    <item.icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* 설정 + 관리자 */}
        <div className="border-t border-border-primary pt-3 mt-2 space-y-0.5">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
              pathname.startsWith("/settings")
                ? "bg-brand-subtle text-brand font-semibold"
                : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary font-medium",
            )}
          >
            <Settings size={16} strokeWidth={pathname.startsWith("/settings") ? 2.2 : 1.8} />
            설정
          </Link>
          <Link
            href="/admin/users"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
              pathname.startsWith("/admin")
                ? "bg-brand-subtle text-brand font-semibold"
                : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary font-medium",
            )}
          >
            <Shield size={16} strokeWidth={pathname.startsWith("/admin") ? 2.2 : 1.8} />
            관리자
          </Link>
        </div>
      </nav>

      {/* 하단 PRO 배너 */}
      <div className="p-3">
        <Link
          href="/settings"
          className="block rounded-xl bg-brand-subtle border border-brand/10 p-3 hover:border-brand/30 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <Crown size={14} className="text-brand" />
            <span className="text-xs font-semibold text-brand">PRO 업그레이드</span>
          </div>
          <p className="text-[10px] text-text-secondary leading-relaxed">
            무제한 키워드 추적 + AI 리뷰 자동 답글
          </p>
        </Link>
      </div>
    </aside>
  );
}

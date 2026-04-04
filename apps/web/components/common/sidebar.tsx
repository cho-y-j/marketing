"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Search,
  FileText,
  Settings,
  PlusCircle,
  Store,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard, color: "text-blue-500" },
  { href: "/stores", label: "내 매장", icon: Store, color: "text-violet-500" },
  { href: "/analysis", label: "매장 분석", icon: BarChart3, color: "text-orange-500" },
  { href: "/competitors", label: "경쟁 비교", icon: Users, color: "text-rose-500" },
  { href: "/keywords", label: "키워드", icon: Search, color: "text-emerald-500" },
  { href: "/content", label: "콘텐츠", icon: FileText, color: "text-purple-500" },
  { href: "/settings", label: "설정", icon: Settings, color: "text-gray-500" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-gradient-to-b from-card to-card/80 h-screen sticky top-0">
      {/* 로고 */}
      <div className="p-5 border-b">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">마케팅 AI</h1>
            <p className="text-[11px] text-muted-foreground leading-none">매장 마케팅 매니저</p>
          </div>
        </div>
      </div>

      {/* 매장 등록 */}
      <div className="px-3 pt-4">
        <Link
          href="/stores/new"
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
        >
          <PlusCircle size={16} />
          매장 등록
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 pt-4 space-y-0.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-2">메뉴</p>
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <item.icon size={18} className={isActive ? "text-primary" : item.color} />
              {item.label}
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* 하단 프로 배너 */}
      <div className="p-3">
        <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/50 p-3.5">
          <p className="text-xs font-semibold text-amber-800">PRO 업그레이드</p>
          <p className="text-[11px] text-amber-600 mt-0.5 leading-snug">무제한 키워드 추적 + AI 리뷰 답글</p>
          <button className="mt-2 text-[11px] font-semibold text-amber-700 hover:text-amber-900 transition-colors">
            자세히 보기 →
          </button>
        </div>
      </div>
    </aside>
  );
}

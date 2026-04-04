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
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/stores", label: "내 매장", icon: Store },
  { href: "/analysis", label: "매장 분석", icon: BarChart3 },
  { href: "/competitors", label: "경쟁 비교", icon: Users },
  { href: "/keywords", label: "키워드", icon: Search },
  { href: "/content", label: "콘텐츠", icon: FileText },
  { href: "/settings", label: "설정", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 flex-col border-r bg-card h-screen sticky top-0">
      {/* 로고 */}
      <div className="p-5 border-b">
        <h1 className="text-lg font-bold text-primary">마케팅 인텔리전스</h1>
        <p className="text-xs text-muted-foreground mt-0.5">AI 매장 마케팅 매니저</p>
      </div>

      {/* 매장 등록 */}
      <div className="px-3 pt-3">
        <Link
          href="/stores/new"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <PlusCircle size={16} />
          매장 등록
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 p-3 space-y-1">
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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

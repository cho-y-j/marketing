"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Search,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "홈", icon: LayoutDashboard },
  { href: "/keywords", label: "키워드", icon: Search },
  { href: "/analysis", label: "분석", icon: BarChart3 },
  { href: "/competitors", label: "비교", icon: Users },
  { href: "/settings", label: "설정", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-border/50 z-50 safe-area-pb">
      <div className="flex justify-around items-center h-16 px-1">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all min-w-[52px]",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:scale-95",
              )}
            >
              <div className={cn(
                "p-1 rounded-lg transition-all",
                isActive && "bg-primary/10",
              )}>
                <tab.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn(
                "text-[10px] leading-none",
                isActive ? "font-semibold" : "font-medium",
              )}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

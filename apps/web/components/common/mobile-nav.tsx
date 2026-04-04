"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  FileText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "홈", icon: LayoutDashboard },
  { href: "/analysis", label: "분석", icon: BarChart3 },
  { href: "/competitors", label: "비교", icon: Users },
  { href: "/content", label: "콘텐츠", icon: FileText },
  { href: "/settings", label: "설정", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-50">
      <div className="flex justify-around items-center h-16">
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
                "flex flex-col items-center gap-0.5 text-xs transition-colors",
                isActive ? "text-primary" : "text-text-secondary",
              )}
            >
              <tab.icon size={20} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Settings, BookOpen, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { href: "/admin/users", label: "회원 관리", icon: Users },
  { href: "/admin/rules", label: "룰 관리", icon: BookOpen },
  { href: "/admin/consultations", label: "상담 신청", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-56 flex-col border-r bg-white">
      <div className="p-4 border-b">
        <Link href="/admin/users" className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm">관리자 패널</span>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          ← 대시보드로 돌아가기
        </Link>
      </div>
    </aside>
  );
}

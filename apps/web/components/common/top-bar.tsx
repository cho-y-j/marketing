"use client";

import { User, Sparkles } from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { StoreSwitcher } from "./store-switcher";

export function TopBar() {
  return (
    <header className="h-14 border-b border-border-primary bg-surface/80 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between px-4 md:px-6">
      {/* 모바일 로고 */}
      <div className="md:hidden flex items-center gap-2">
        <div className="size-7 rounded-lg bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center">
          <Sparkles size={14} className="text-white" />
        </div>
        <h1 className="text-sm font-bold text-text-primary">마케팅 AI</h1>
      </div>

      {/* 매장 선택 */}
      <div className="hidden md:block">
        <StoreSwitcher />
      </div>

      {/* 모바일 매장 선택 */}
      <div className="md:hidden">
        <StoreSwitcher compact />
      </div>

      {/* 우측 아이콘 */}
      <div className="flex items-center gap-1">
        <NotificationBell />
        <button className="size-8 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center">
          <User size={14} className="text-white" />
        </button>
      </div>
    </header>
  );
}

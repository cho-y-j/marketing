"use client";

import { User } from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { StoreSwitcher } from "./store-switcher";

export function TopBar() {
  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 md:px-6">
      {/* 모바일 로고 */}
      <div className="md:hidden">
        <h1 className="text-base font-bold text-primary">마케팅 인텔리전스</h1>
      </div>

      {/* 매장 선택 (데스크톱) */}
      <div className="hidden md:block">
        <StoreSwitcher />
      </div>

      {/* 우측 아이콘 */}
      <div className="flex items-center gap-2">
        <NotificationBell />
        <button className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <User size={16} className="text-primary" />
        </button>
      </div>
    </header>
  );
}

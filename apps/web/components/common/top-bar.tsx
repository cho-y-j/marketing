"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Sparkles, LogOut } from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { StoreSwitcher } from "./store-switcher";
import { apiClient } from "@/lib/api-client";

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
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 이메일은 /auth/me 로 확인 (토큰 없으면 null)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const { data } = await apiClient.get("/auth/me");
        if (!cancelled) setEmail(data?.email ?? null);
      } catch {
        if (!cancelled) setEmail(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
    setOpen(false);
    router.push("/login");
    // 캐시 전체 제거를 위해 약간의 지연 후 full reload
    setTimeout(() => {
      if (typeof window !== "undefined") window.location.reload();
    }, 50);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="size-8 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center hover:brightness-110 transition-all"
        aria-label="사용자 메뉴"
      >
        <User size={14} className="text-white" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border-primary bg-surface shadow-lg overflow-hidden z-40">
          <div className="px-4 py-3 border-b border-border-primary">
            <p className="text-[11px] text-text-tertiary">로그인 중</p>
            <p className="text-sm font-semibold text-text-primary truncate">
              {email ?? "로딩 중..."}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-tertiary transition-colors"
          >
            <LogOut size={14} />
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

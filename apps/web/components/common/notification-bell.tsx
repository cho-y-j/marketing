"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Bell, Check, BellDot } from "lucide-react";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get("/notifications/unread");
        return data;
      } catch {
        return [];
      }
    },
    refetchInterval: 30000,
  });

  const markAllRead = useMutation({
    mutationFn: () => apiClient.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const count = notifications?.length ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-surface-tertiary transition-colors"
      >
        {count > 0 ? (
          <BellDot size={18} className="text-brand" />
        ) : (
          <Bell size={18} className="text-text-tertiary" />
        )}
        {count > 0 && (
          <span className="absolute top-1 right-1 size-4 bg-danger text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-80 bg-surface border border-border-primary rounded-2xl shadow-lg z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
              <span className="text-sm font-semibold">알림</span>
              {count > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs text-brand hover:underline flex items-center gap-1"
                >
                  <Check size={12} /> 모두 읽음
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {count === 0 ? (
                <div className="py-8 text-center">
                  <Bell size={24} className="text-text-tertiary mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">새 알림이 없습니다</p>
                </div>
              ) : (
                notifications?.map((n: any) => (
                  <div
                    key={n.id}
                    className="px-4 py-3 border-b border-border-secondary last:border-0 hover:bg-surface-secondary transition-colors"
                  >
                    <p className="text-sm font-medium text-text-primary">{n.title}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

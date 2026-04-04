"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Bell, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get("/notifications/unread");
        return data;
      } catch { return []; }
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
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
      >
        <Bell size={18} className="text-muted-foreground" />
        {count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-72 bg-card border rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-medium">알림</span>
              {count > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Check size={12} /> 모두 읽음
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {count === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">새 알림이 없습니다</p>
              ) : (
                notifications?.map((n: any) => (
                  <div key={n.id} className="px-3 py-2 border-b last:border-0 hover:bg-muted/50">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
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

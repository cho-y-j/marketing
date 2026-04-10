"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { CARD_BASE } from "@/lib/design-system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  CheckCheck,
  Loader2,
  Info,
  AlertTriangle,
  TrendingUp,
  Megaphone,
} from "lucide-react";

function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await apiClient.get("/notifications");
      return data as Array<{
        id: string;
        title: string;
        message: string;
        type: string;
        isRead: boolean;
        createdAt: string;
      }>;
    },
  });
}

function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const { data } = await apiClient.get("/notifications/unread");
      return data as { count: number };
    },
  });
}

function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
  });
}

function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.post("/notifications/read-all");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications", "unread"] });
      toast.success("모든 알림을 읽음 처리했습니다");
    },
    onError: () => toast.error("읽음 처리 실패"),
  });
}

const typeIconMap: Record<string, React.ElementType> = {
  INFO: Info,
  WARNING: AlertTriangle,
  TREND: TrendingUp,
  MARKETING: Megaphone,
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const { data: unreadData } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const items = notifications ?? [];
  const unreadCount = unreadData?.count ?? items.filter((n) => !n.isRead).length;

  const handleClick = (item: (typeof items)[0]) => {
    if (!item.isRead) {
      markRead.mutate(item.id);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary">
            알림
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            {unreadCount > 0
              ? `읽지 않은 알림 ${unreadCount}개`
              : "새로운 알림이 없습니다"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="rounded-xl border-border-primary"
          >
            {markAllRead.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <CheckCheck size={14} className="mr-1.5" />
            )}
            전체 읽음
          </Button>
        )}
      </div>

      {/* 알림 목록 */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={CARD_BASE}>
          <div className="py-16 text-center">
            <div className="size-16 rounded-2xl bg-surface-tertiary flex items-center justify-center mx-auto mb-4">
              <BellOff size={24} className="text-text-tertiary" />
            </div>
            <p className="text-text-secondary font-medium">알림이 없습니다</p>
            <p className="text-sm text-text-tertiary mt-1">
              새로운 소식이 있으면 여기에 표시됩니다
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const IconComp = typeIconMap[item.type] ?? Bell;
            return (
              <div
                key={item.id}
                onClick={() => handleClick(item)}
                className={`${CARD_BASE} overflow-hidden cursor-pointer hover:shadow-md transition-all ${
                  !item.isRead ? "border-l-2 border-l-brand" : ""
                }`}
              >
                <div className="p-4 flex gap-3">
                  <div
                    className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                      !item.isRead
                        ? "bg-brand-subtle"
                        : "bg-surface-tertiary"
                    }`}
                  >
                    <IconComp
                      size={14}
                      className={
                        !item.isRead ? "text-brand" : "text-text-tertiary"
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-sm truncate ${
                          !item.isRead
                            ? "font-semibold text-text-primary"
                            : "font-medium text-text-secondary"
                        }`}
                      >
                        {item.title}
                      </p>
                      <span className="text-[10px] text-text-tertiary shrink-0">
                        {formatTimeAgo(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

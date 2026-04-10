"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  ExternalLink,
  Loader2,
  Unlink,
  MessageSquareText,
  BarChart3,
  FileEdit,
} from "lucide-react";

const NAVER_CLIENT_ID = "VGUhO0oUl0_T_xu24q92";
const REDIRECT_URI =
  typeof window !== "undefined"
    ? `${window.location.origin}/settings/naver-callback`
    : "";

function getNaverAuthUrl() {
  const state = Math.random().toString(36).substring(2, 15);
  if (typeof window !== "undefined") {
    sessionStorage.setItem("naver_oauth_state", state);
  }
  return `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
}

export function NaverConnectCard() {
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["naver-status"],
    queryFn: async () => {
      const { data } = await apiClient.get("/auth/naver/status");
      return data;
    },
  });

  const disconnect = useMutation({
    mutationFn: () => apiClient.delete("/auth/naver/disconnect"),
    onSuccess: () => {
      toast.success("네이버 연동이 해제되었습니다");
      qc.invalidateQueries({ queryKey: ["naver-status"] });
    },
    onError: () => toast.error("연동 해제 실패"),
  });

  const handleConnect = () => {
    window.location.href = getNaverAuthUrl();
  };

  const handleDisconnect = () => {
    if (!confirm("네이버 연동을 해제하시겠습니까?\n리뷰 수집, AI 답글 게시 등이 중단됩니다."))
      return;
    disconnect.mutate();
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }

  const connected = status?.connected && !status?.expired;

  return (
    <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#03C75A]/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M13.5 10.5L6.5 3V17L13.5 10.5Z" fill="#03C75A" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold">네이버 스마트플레이스 연동</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                {connected
                  ? "연동됨 · 리뷰 수집 및 답글 가능"
                  : "리뷰 수집, AI 답글, 통계를 위해 연동해주세요"}
              </p>
            </div>
          </div>

          {connected ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-success font-medium flex items-center gap-1">
                <Check size={12} /> 연동됨
              </span>
              <button
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
                className="text-xs text-text-tertiary hover:text-danger flex items-center gap-1 transition-colors"
              >
                {disconnect.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Unlink size={12} />
                )}
                해제
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#03C75A] text-white text-xs font-semibold hover:bg-[#02b351] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M13.5 10.5L6.5 3V17L13.5 10.5Z" fill="white" />
              </svg>
              네이버 계정 연동하기
            </button>
          )}
        </div>

        {/* 연동하면 가능한 기능 */}
        {!connected && (
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                icon: MessageSquareText,
                bg: "bg-info-light",
                color: "text-info",
                label: "리뷰 자동 수집",
                desc: "새 리뷰 실시간 알림",
              },
              {
                icon: FileEdit,
                bg: "bg-success-light",
                color: "text-success",
                label: "AI 답글 게시",
                desc: "승인하면 자동 게시",
              },
              {
                icon: BarChart3,
                bg: "bg-brand-subtle",
                color: "text-brand",
                label: "방문자 통계",
                desc: "실시간 유입 데이터",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-surface-secondary p-3 text-center"
              >
                <div
                  className={`size-8 rounded-lg ${item.bg} flex items-center justify-center mx-auto mb-2`}
                >
                  <item.icon size={14} className={item.color} />
                </div>
                <p className="text-xs font-medium">{item.label}</p>
                <p className="text-[10px] text-text-tertiary mt-0.5">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* 연동 만료 경고 */}
        {status?.connected && status?.expired && (
          <div className="mt-4 p-3 rounded-xl bg-warning-light border border-warning/20">
            <p className="text-xs text-text-primary font-medium">
              네이버 연동이 만료되었습니다
            </p>
            <p className="text-[10px] text-text-secondary mt-0.5">
              아래 버튼을 눌러 다시 연동해주세요
            </p>
            <button
              onClick={handleConnect}
              className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-[#03C75A] text-white font-medium"
            >
              다시 연동하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

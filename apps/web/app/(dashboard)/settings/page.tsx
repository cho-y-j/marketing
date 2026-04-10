"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSubscription,
  useRegisterApiKey,
  useDeleteApiKey,
} from "@/hooks/useSubscription";
import { usePushSubscribe } from "@/hooks/usePushSubscribe";
import { toast } from "sonner";
import { NaverConnectCard } from "@/components/settings/naver-connect-card";
import { SmartPlaceConnectCard } from "@/components/settings/smartplace-connect-card";
import {
  Bell,
  BellRing,
  Key,
  CreditCard,
  Loader2,
  Check,
  Trash2,
  Send,
  AlertCircle,
  LogOut,
  Settings,
  ArrowRight,
} from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const { data: sub, isLoading } = useSubscription();
  const registerKey = useRegisterApiKey();
  const deleteKey = useDeleteApiKey();
  const push = usePushSubscribe();
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);

  const handleRegisterKey = () => {
    if (!apiKey.trim()) {
      toast.error("API 키를 입력해주세요");
      return;
    }
    registerKey.mutate(
      { apiKey: apiKey.trim() },
      {
        onSuccess: (r: any) => {
          toast.success(`API 키 등록 완료 (${r.maskedKey})`);
          setApiKey("");
        },
        onError: (e: any) =>
          toast.error(
            "키 등록 실패: " + (e.response?.data?.message || e.message),
          ),
      },
    );
  };

  const handleDeleteKey = () => {
    if (!confirm("등록된 API 키를 삭제하시겠습니까?")) return;
    deleteKey.mutate(undefined, {
      onSuccess: () => toast.success("API 키가 삭제되었습니다"),
      onError: (e: any) =>
        toast.error("삭제 실패: " + (e.response?.data?.message || e.message)),
    });
  };

  const handleSubscribe = async () => {
    try {
      await push.subscribe();
      toast.success("푸시 알림이 활성화되었습니다");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleUnsubscribe = async () => {
    try {
      await push.unsubscribe();
      toast.success("푸시 알림이 해제되었습니다");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleTestPush = async () => {
    setTesting(true);
    try {
      const r = await push.sendTest();
      if (r.sent > 0) {
        toast.success(`테스트 알림 발송됨 (${r.sent}개 채널)`);
      } else if (r.failed > 0) {
        toast.error(`발송 실패 (${r.failed}건)`);
      } else {
        toast.warning("활성 구독이 없습니다");
      }
    } catch (e: any) {
      toast.error("발송 실패: " + (e.response?.data?.message || e.message));
    } finally {
      setTesting(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      router.push("/login");
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">설정</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          계정, 알림, API 키 관리
        </p>
      </div>

      {/* 네이버 스마트플레이스 연동 — 가장 중요 */}
      <NaverConnectCard />

      {/* 스마트플레이스 Biz ID 연결 — 리뷰 답글 바로가기 */}
      <SmartPlaceConnectCard />

      {/* 자동화 설정 바로가기 */}
      <Link
        href="/settings/automation"
        className="flex items-center justify-between p-4 rounded-2xl border border-border-primary bg-surface shadow-sm hover:border-brand/20 hover:shadow-md transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-brand-subtle flex items-center justify-center">
            <Settings size={18} className="text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI 자동화 설정</p>
            <p className="text-xs text-text-secondary">
              리뷰 자동 답변, 콘텐츠 자동 발행, 키워드 자동 추가
            </p>
          </div>
        </div>
        <ArrowRight size={16} className="text-text-tertiary" />
      </Link>

      {/* 푸시 알림 */}
      <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-9 rounded-xl bg-info-light flex items-center justify-center">
            <BellRing size={16} className="text-info" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">웹 푸시 알림</h3>
            <p className="text-xs text-text-secondary">
              매일 아침 브리핑 + 리뷰 검수 알림
            </p>
          </div>
        </div>

        {push.supported === false ? (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-warning-light border border-warning/20">
            <AlertCircle size={14} className="text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-text-secondary">
              이 브라우저는 웹 푸시를 지원하지 않습니다
            </p>
          </div>
        ) : push.supported === null ? (
          <Skeleton className="h-10 w-full rounded-xl" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-secondary">
              <div>
                <p className="text-sm font-medium">
                  상태:{" "}
                  {push.subscribed ? (
                    <span className="text-success">구독중</span>
                  ) : (
                    <span className="text-text-tertiary">미구독</span>
                  )}
                </p>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  권한:{" "}
                  {push.permission === "granted"
                    ? "허용됨"
                    : push.permission === "denied"
                      ? "거부됨"
                      : "미요청"}
                </p>
              </div>
              {push.subscribed ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnsubscribe}
                  disabled={push.busy}
                  className="rounded-xl h-9"
                >
                  {push.busy ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    "구독 해제"
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubscribe}
                  disabled={push.busy}
                  className="rounded-xl h-9 bg-brand hover:bg-brand-dark"
                >
                  {push.busy ? (
                    <Loader2 size={12} className="animate-spin mr-1.5" />
                  ) : (
                    <Bell size={12} className="mr-1.5" />
                  )}
                  구독하기
                </Button>
              )}
            </div>

            {push.subscribed && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestPush}
                disabled={testing}
                className="w-full rounded-xl h-9"
              >
                {testing ? (
                  <Loader2 size={12} className="animate-spin mr-1.5" />
                ) : (
                  <Send size={12} className="mr-1.5" />
                )}
                테스트 알림 보내기
              </Button>
            )}

            {push.error && (
              <div className="flex items-start gap-2 p-2 rounded-xl bg-danger-light border border-danger/20">
                <AlertCircle
                  size={12}
                  className="text-danger mt-0.5 shrink-0"
                />
                <p className="text-[11px] text-text-secondary">{push.error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* API 키 */}
      <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-9 rounded-xl bg-brand-subtle flex items-center justify-center">
            <Key size={16} className="text-brand" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Anthropic API 키</h3>
            <p className="text-xs text-text-secondary">
              내 API 키로 실시간 분석 (AES-256-GCM 암호화)
            </p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : sub?.hasApiKey ? (
          <div className="flex items-center justify-between p-3 rounded-xl bg-success-light border border-success/20">
            <div>
              <p className="text-xs font-medium text-success flex items-center gap-1.5">
                <Check size={12} /> 등록됨
              </p>
              <p className="text-sm font-mono mt-0.5">
                {sub.anthropicApiKeyMasked}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteKey}
              disabled={deleteKey.isPending}
              className="rounded-xl h-9 text-danger hover:bg-danger-light"
            >
              {deleteKey.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-ant-api03-..."
                value={apiKey}
                onChange={(e: any) => setApiKey(e.target.value)}
                className="rounded-xl h-10 font-mono text-xs"
              />
              <Button
                onClick={handleRegisterKey}
                disabled={registerKey.isPending || !apiKey.trim()}
                className="rounded-xl h-10 bg-brand hover:bg-brand-dark"
              >
                {registerKey.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  "등록"
                )}
              </Button>
            </div>
            <p className="text-[11px] text-text-tertiary">
              등록 시 Anthropic API에 ping으로 키 유효성을 검증합니다
            </p>
          </div>
        )}
      </div>

      {/* 구독 정보 */}
      <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-9 rounded-xl bg-warning-light flex items-center justify-center">
            <CreditCard size={16} className="text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">구독 정보</h3>
            <p className="text-xs text-text-secondary">현재 플랜과 만료일</p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-secondary">
              <span className="text-xs text-text-secondary">현재 플랜</span>
              <span className="text-sm font-bold">
                {sub?.subscriptionPlan === "PREMIUM"
                  ? "프리미엄"
                  : sub?.subscriptionPlan === "BASIC"
                    ? "기본"
                    : "무료"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-secondary">
              <span className="text-xs text-text-secondary">만료일</span>
              <span className="text-sm">
                {sub?.subscriptionEndAt
                  ? new Date(sub.subscriptionEndAt).toLocaleDateString("ko-KR")
                  : "-"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 로그아웃 */}
      <Button
        variant="ghost"
        onClick={handleLogout}
        className="w-full rounded-xl h-11 text-danger hover:bg-danger-light"
      >
        <LogOut size={14} className="mr-2" />
        로그아웃
      </Button>
    </div>
  );
}

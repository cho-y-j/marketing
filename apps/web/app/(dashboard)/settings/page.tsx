"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Bell,
  BellRing,
  Key,
  CreditCard,
  Loader2,
  Check,
  X,
  Trash2,
  Send,
  AlertCircle,
  LogOut,
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
        onSuccess: (r) => {
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
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">설정</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          계정, 알림, API 키 관리
        </p>
      </div>

      {/* === 푸시 알림 === */}
      <Card className="rounded-2xl overflow-hidden">
        <CardContent className="pt-5 pb-4 px-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <BellRing size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold">웹 푸시 알림</h3>
              <p className="text-xs text-muted-foreground">
                매일 아침 브리핑 + 리뷰 검수 알림
              </p>
            </div>
          </div>

          {push.supported === false ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                이 브라우저는 웹 푸시를 지원하지 않습니다 (Safari 16.4+, Chrome,
                Edge, Firefox 사용 권장)
              </p>
            </div>
          ) : push.supported === null ? (
            <Skeleton className="h-10 w-full rounded-lg" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div>
                  <p className="text-sm font-medium">
                    상태:{" "}
                    {push.subscribed ? (
                      <span className="text-emerald-600">✓ 구독중</span>
                    ) : (
                      <span className="text-gray-500">미구독</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    권한: {push.permission === "granted" ? "허용됨" : push.permission === "denied" ? "거부됨" : "미요청"}
                  </p>
                </div>
                {push.subscribed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUnsubscribe}
                    disabled={push.busy}
                    className="rounded-lg h-9"
                  >
                    {push.busy ? <Loader2 size={12} className="animate-spin" /> : "구독 해제"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleSubscribe}
                    disabled={push.busy}
                    className="rounded-lg h-9 bg-blue-600 hover:bg-blue-700"
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
                  className="w-full rounded-lg h-9"
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
                <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-50 border border-rose-200">
                  <AlertCircle size={12} className="text-rose-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-rose-800">{push.error}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === Anthropic API 키 (프리미엄) === */}
      <Card className="rounded-2xl overflow-hidden">
        <CardContent className="pt-5 pb-4 px-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
              <Key size={16} className="text-violet-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Anthropic API 키 (프리미엄)</h3>
              <p className="text-xs text-muted-foreground">
                내 API 키로 실시간 분석 (서버에 AES-256-GCM 암호화 저장)
              </p>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-20 w-full rounded-lg" />
          ) : sub?.hasApiKey ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div>
                  <p className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
                    <Check size={12} /> 등록됨
                  </p>
                  <p className="text-sm font-mono text-emerald-900 mt-0.5">
                    {sub.anthropicApiKeyMasked}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteKey}
                  disabled={deleteKey.isPending}
                  className="rounded-lg h-9 text-rose-600 hover:bg-rose-50"
                >
                  {deleteKey.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="sk-ant-api03-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="rounded-lg h-10 font-mono text-xs"
                />
                <Button
                  onClick={handleRegisterKey}
                  disabled={registerKey.isPending || !apiKey.trim()}
                  className="rounded-lg h-10 bg-violet-600 hover:bg-violet-700"
                >
                  {registerKey.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    "등록"
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                등록 시 Anthropic API 에 ping 으로 키 유효성 검증 후 암호화 저장합니다.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* === 구독 정보 === */}
      <Card className="rounded-2xl overflow-hidden">
        <CardContent className="pt-5 pb-4 px-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <CreditCard size={16} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold">구독 정보</h3>
              <p className="text-xs text-muted-foreground">현재 플랜과 만료일</p>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <span className="text-xs text-muted-foreground">현재 플랜</span>
                <span className="text-sm font-bold">
                  {sub?.subscriptionPlan === "PREMIUM"
                    ? "💎 프리미엄"
                    : sub?.subscriptionPlan === "BASIC"
                      ? "⭐ 기본"
                      : "🆓 무료"}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <span className="text-xs text-muted-foreground">만료일</span>
                <span className="text-sm">
                  {sub?.subscriptionEndAt
                    ? new Date(sub.subscriptionEndAt).toLocaleDateString()
                    : "-"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 로그아웃 */}
      <Button
        variant="ghost"
        onClick={handleLogout}
        className="w-full rounded-xl h-11 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
      >
        <LogOut size={14} className="mr-2" />
        로그아웃
      </Button>
    </div>
  );
}

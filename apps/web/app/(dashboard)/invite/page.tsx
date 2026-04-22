"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Copy, Share2, Users, Coins, Check, Gift } from "lucide-react";

export default function InvitePage() {
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-referral"],
    queryFn: () => apiClient.get("/auth/referral").then((r) => r.data),
  });

  const code: string | null = data?.referralCode ?? null;
  const invitedCount: number = data?.invitedCount ?? 0;
  const points: number = data?.points ?? 0;
  const invitedUsers: Array<{ id: string; name: string; joinedAt: string }> = data?.invitedUsers ?? [];

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteLink = code ? `${origin}/register?ref=${code}` : "";

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("추천 코드가 복사됐어요");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    toast.success("초대 링크가 복사됐어요");
  };

  const shareNative = async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "마케팅 AI — 자영업자 전용 네이버 마케팅 도구",
          text: `내 추천코드로 가입하면 포인트 드려요!\n코드: ${code}`,
          url: inviteLink,
        });
      } catch {}
    } else {
      await copyLink();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-10">
      {/* 헤더 */}
      <div className="pt-1">
        <h1 className="text-xl md:text-2xl font-bold">친구 초대하기</h1>
        <p className="text-xs text-muted-foreground mt-1">
          주변 사장님에게 추천하고 포인트를 받으세요
        </p>
      </div>

      {/* 상태 카드 2개 — 초대 인원 + 포인트 */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-brand/20 bg-brand-subtle/30">
          <CardContent className="p-4 text-center">
            <Users size={20} className="mx-auto text-brand mb-1.5" />
            <p className="text-[11px] text-muted-foreground leading-tight mb-1">
              초대한 친구
            </p>
            <p className="text-2xl font-black text-brand">{invitedCount}명</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="p-4 text-center">
            <Coins size={20} className="mx-auto text-amber-600 mb-1.5" />
            <p className="text-[11px] text-muted-foreground leading-tight mb-1">
              보유 포인트
            </p>
            <p className="text-2xl font-black text-amber-700">{points.toLocaleString()}P</p>
          </CardContent>
        </Card>
      </div>

      {/* 내 추천 코드 — 히어로 카드 */}
      <Card className="border-brand/30">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Gift size={14} className="text-brand" />
            <span className="text-xs font-bold text-brand">내 추천 코드</span>
          </div>
          {code ? (
            <>
              <div className="bg-muted/40 rounded-xl py-6 text-center mb-4 tracking-[0.3em] text-3xl font-black">
                {code}
              </div>
              <div className="flex gap-2">
                <Button onClick={copyCode} variant="outline" size="default" className="flex-1">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? " 복사됨" : " 코드 복사"}
                </Button>
                <Button onClick={shareNative} size="default" className="flex-1">
                  <Share2 size={14} /> 공유하기
                </Button>
              </div>
              <button
                onClick={copyLink}
                className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground mt-3 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors break-all"
              >
                🔗 {inviteLink}
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              추천 코드 생성 중...
            </p>
          )}
        </CardContent>
      </Card>

      {/* 안내 */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-bold mb-3">어떻게 적립되나요?</h3>
          <ol className="space-y-2.5 text-sm text-muted-foreground">
            <li className="flex gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center">1</span>
              <span>내 추천 코드 또는 초대 링크를 주변 사장님에게 공유하세요</span>
            </li>
            <li className="flex gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center">2</span>
              <span>친구가 이 코드로 가입하면 자동으로 기록됩니다</span>
            </li>
            <li className="flex gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center">3</span>
              <span>
                초대 1명당 <strong className="text-foreground">2,000P</strong> (준비 중 — 오픈 시 일괄 지급)
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* 초대 내역 */}
      {invitedUsers.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-bold mb-3">최근 초대한 친구 ({invitedUsers.length}명)</h3>
            <div className="space-y-2">
              {invitedUsers.slice(0, 10).map((u) => (
                <div key={u.id} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-sm font-medium">{u.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(u.joinedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} 가입
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
// import { usePendingActions } from "@/hooks/useROI";
import { useReviews } from "@/hooks/useReviews";
import { useContents } from "@/hooks/useContent";
import {
  MessageSquareText,
  FileEdit,
  ArrowRight,
  Bot,
} from "lucide-react";

export function AiActivityBanner({ storeId }: { storeId: string }) {
  const { data: reviews } = useReviews(storeId);
  const { data: contents } = useContents(storeId);

  const draftedReviews = (reviews ?? []).filter(
    (r: any) => r.replyStatus === "DRAFTED",
  ).length;
  const pendingReviews = (reviews ?? []).filter(
    (r: any) => r.replyStatus === "PENDING",
  ).length;
  const recentContents = (contents ?? []).filter((c: any) => {
    const age = Date.now() - new Date(c.createdAt).getTime();
    return age < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const items: Array<{
    href: string;
    icon: any;
    bg: string;
    color: string;
    count: number;
    label: string;
    action: string;
  }> = [];

  if (draftedReviews > 0) {
    items.push({
      href: "/reviews",
      icon: MessageSquareText,
      bg: "bg-info-light",
      color: "text-info",
      count: draftedReviews,
      label: "AI 답글 복사 대기",
      action: "확인 후 복사하기",
    });
  }

  if (pendingReviews > 0) {
    items.push({
      href: "/reviews",
      icon: MessageSquareText,
      bg: "bg-warning-light",
      color: "text-warning",
      count: pendingReviews,
      label: "새 리뷰 답글 생성 가능",
      action: "AI 답글 만들기",
    });
  }

  if (recentContents > 0) {
    items.push({
      href: "/content",
      icon: FileEdit,
      bg: "bg-success-light",
      color: "text-success",
      count: recentContents,
      label: "이번 주 생성된 콘텐츠",
      action: "복사해서 올리기",
    });
  }

  // 아무것도 없으면 AI 소개 배너
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-brand-subtle flex items-center justify-center shrink-0">
            <Bot size={20} className="text-brand" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">AI가 24시간 일하고 있어요</p>
            <p className="text-xs text-text-secondary mt-0.5">
              매일 새벽 리뷰 수집, 경쟁사 감시, 키워드 분석을 자동으로 수행합니다
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/reviews"
              className="text-xs px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-tertiary text-text-secondary font-medium transition-colors"
            >
              리뷰 답글
            </Link>
            <Link
              href="/content"
              className="text-xs px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-tertiary text-text-secondary font-medium transition-colors"
            >
              콘텐츠 생성
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4 hover:shadow-md hover:border-brand/20 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div
              className={`size-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0 relative`}
            >
              <item.icon size={18} className={item.color} />
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                {item.count}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className={`text-xs font-medium ${item.color} mt-0.5 flex items-center gap-1`}>
                {item.action}
                <ArrowRight
                  size={12}
                  className="group-hover:translate-x-0.5 transition-transform"
                />
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

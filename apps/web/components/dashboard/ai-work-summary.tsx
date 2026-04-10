"use client";

import Link from "next/link";
import { useReviews } from "@/hooks/useReviews";
import { useContents } from "@/hooks/useContent";
import { useWeeklyActions } from "@/hooks/useROI";
import { useCompetitorAlerts } from "@/hooks/useROI";
import {
  Bot,
  MessageSquareText,
  FileEdit,
  Zap,
  Shield,
  ArrowRight,
  TrendingUp,
} from "lucide-react";

export function AiWorkSummary({ storeId }: { storeId: string }) {
  const { data: reviews } = useReviews(storeId);
  const { data: contents } = useContents(storeId);
  const { data: weekly } = useWeeklyActions(storeId);
  const { data: alerts } = useCompetitorAlerts(storeId);

  const repliedReviews = (reviews ?? []).filter(
    (r: any) => r.replyStatus === "APPROVED" || r.replyStatus === "PUBLISHED",
  ).length;

  const totalContents = (contents ?? []).length;
  const totalActions = weekly?.totalActions ?? 0;
  const alertCount = (alerts ?? []).length;

  const stats = [
    {
      icon: MessageSquareText,
      bg: "bg-info-light",
      color: "text-info",
      value: repliedReviews,
      label: "리뷰 AI 답글",
      href: "/reviews",
    },
    {
      icon: FileEdit,
      bg: "bg-success-light",
      color: "text-success",
      value: totalContents,
      label: "AI 콘텐츠 생성",
      href: "/content",
    },
    {
      icon: Zap,
      bg: "bg-warning-light",
      color: "text-warning",
      value: totalActions,
      label: "마케팅 액션 수행",
      href: "/analysis",
    },
    {
      icon: Shield,
      bg: "bg-danger-light",
      color: "text-danger",
      value: alertCount,
      label: "경쟁사 감시 알림",
      href: "/competitors",
    },
  ];

  return (
    <div className="rounded-2xl border border-border-primary bg-surface shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center">
            <Bot size={14} className="text-brand" />
          </div>
          <h3 className="text-sm font-semibold">AI가 해준 일</h3>
        </div>
        <span className="text-[10px] text-text-tertiary">
          서비스 이용 이후 누적
        </span>
      </div>
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-xl bg-surface-secondary p-3 hover:bg-surface-tertiary transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`size-6 rounded-lg ${s.bg} flex items-center justify-center`}
                >
                  <s.icon size={12} className={s.color} />
                </div>
              </div>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-[10px] text-text-tertiary mt-0.5 flex items-center gap-0.5">
                {s.label}
                <ArrowRight
                  size={8}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

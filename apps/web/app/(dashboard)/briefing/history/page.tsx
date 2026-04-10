"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { CARD_BASE } from "@/lib/design-system";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  FileText,
} from "lucide-react";

function useBriefingHistory(storeId: string) {
  return useQuery({
    queryKey: ["briefing", storeId, "history"],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/stores/${storeId}/briefing/history`,
      );
      return data as Array<{
        id: string;
        date: string;
        summary: string;
        trends: Array<{ keyword: string; description: string }>;
        actions: Array<{ action: string; reason: string; priority?: string }>;
        competitorAlert: string | null;
        createdAt: string;
      }>;
    },
    enabled: !!storeId,
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

export default function BriefingHistoryPage() {
  const { storeId } = useCurrentStoreId();
  const { data: history, isLoading } = useBriefingHistory(storeId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const items = history ?? [];

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary">
          브리핑 히스토리
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">
          최근 30일간 AI 브리핑 기록
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={CARD_BASE}>
          <div className="py-16 text-center">
            <div className="size-16 rounded-2xl bg-surface-tertiary flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-text-tertiary" />
            </div>
            <p className="text-text-secondary font-medium">
              브리핑 기록이 없습니다
            </p>
            <p className="text-sm text-text-tertiary mt-1">
              대시보드에서 오늘의 브리핑을 생성하면 기록이 쌓입니다
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className={`${CARD_BASE} overflow-hidden transition-all`}
              >
                {/* 요약 행 */}
                <div
                  className="p-4 flex items-center gap-3 cursor-pointer hover:bg-surface-secondary/50 transition-colors"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="size-10 rounded-xl bg-brand-subtle flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-brand leading-none">
                      {formatShortDate(item.date || item.createdAt)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-tertiary">
                      {formatDate(item.date || item.createdAt)}
                    </p>
                    <p className="text-sm text-text-primary font-medium mt-0.5 line-clamp-1">
                      {item.summary || "브리핑 요약 없음"}
                    </p>
                  </div>
                  <div className="shrink-0 text-text-tertiary">
                    {isExpanded ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </div>
                </div>

                {/* 상세 내용 */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border-primary pt-4">
                    {/* 요약 */}
                    {item.summary && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center">
                            <Sparkles size={14} className="text-brand" />
                          </div>
                          <span className="text-xs font-semibold text-text-secondary">
                            요약
                          </span>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed pl-9">
                          {item.summary}
                        </p>
                      </div>
                    )}

                    {/* 트렌드 */}
                    {item.trends && item.trends.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="size-7 rounded-lg bg-success-light flex items-center justify-center">
                            <TrendingUp size={14} className="text-success" />
                          </div>
                          <span className="text-xs font-semibold text-text-secondary">
                            트렌드
                          </span>
                        </div>
                        <div className="pl-9 space-y-1.5">
                          {item.trends.map((t, i) => (
                            <div key={i} className="text-xs">
                              <span className="font-semibold text-text-primary">
                                {t.keyword}
                              </span>
                              <span className="text-text-tertiary ml-1">
                                {t.description}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 액션 */}
                    {item.actions && item.actions.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="size-7 rounded-lg bg-warning-light flex items-center justify-center">
                            <Lightbulb size={14} className="text-warning" />
                          </div>
                          <span className="text-xs font-semibold text-text-secondary">
                            추천 액션
                          </span>
                        </div>
                        <div className="pl-9 space-y-2">
                          {item.actions.map((a, i) => (
                            <div
                              key={i}
                              className="p-2.5 bg-surface-secondary rounded-lg"
                            >
                              <div className="flex items-center gap-2">
                                <span className="size-5 rounded-full bg-warning-light flex items-center justify-center">
                                  <span className="text-[10px] font-bold text-warning">
                                    {i + 1}
                                  </span>
                                </span>
                                <span className="text-xs font-semibold text-text-primary">
                                  {a.action}
                                </span>
                                {a.priority && (
                                  <span
                                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                      a.priority === "HIGH"
                                        ? "bg-danger-light text-danger"
                                        : a.priority === "MEDIUM"
                                          ? "bg-warning-light text-warning"
                                          : "bg-surface-tertiary text-text-secondary"
                                    }`}
                                  >
                                    {a.priority === "HIGH"
                                      ? "긴급"
                                      : a.priority === "MEDIUM"
                                        ? "중요"
                                        : "참고"}
                                  </span>
                                )}
                              </div>
                              {a.reason && (
                                <p className="text-[11px] text-text-tertiary mt-1 pl-7">
                                  {a.reason}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 경쟁사 알림 */}
                    {item.competitorAlert && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="size-7 rounded-lg bg-danger-light flex items-center justify-center">
                            <AlertTriangle
                              size={14}
                              className="text-danger"
                            />
                          </div>
                          <span className="text-xs font-semibold text-text-secondary">
                            경쟁사 알림
                          </span>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed pl-9">
                          {item.competitorAlert}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

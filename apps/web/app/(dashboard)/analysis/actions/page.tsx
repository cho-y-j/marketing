"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { CARD_BASE } from "@/lib/design-system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Activity,
  ArrowUp,
  ArrowDown,
  Minus,
  Loader2,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
} from "lucide-react";

function useActions(storeId: string) {
  return useQuery({
    queryKey: ["actions", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/stores/${storeId}/analysis/actions`,
      );
      return data as Array<{
        id: string;
        description: string;
        type: string;
        executedAt: string;
        effectSummary: string | null;
        effect: "POSITIVE" | "NEGATIVE" | "PENDING" | null;
        rankBefore: number | null;
        rankAfter: number | null;
      }>;
    },
    enabled: !!storeId,
  });
}

function useMeasureEffect(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/stores/${storeId}/analysis/actions/measure`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["actions", storeId] });
      toast.success("효과 측정이 완료되었습니다");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "효과 측정 실패"),
  });
}

const effectConfig = {
  POSITIVE: {
    color: "text-success",
    bg: "bg-success-light",
    icon: CheckCircle2,
    label: "효과 있음",
  },
  NEGATIVE: {
    color: "text-danger",
    bg: "bg-danger-light",
    icon: XCircle,
    label: "효과 없음",
  },
  PENDING: {
    color: "text-text-tertiary",
    bg: "bg-surface-tertiary",
    icon: Clock,
    label: "측정 중",
  },
} as const;

export default function ActionsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: actions, isLoading } = useActions(storeId);
  const measure = useMeasureEffect(storeId);

  const items = actions ?? [];

  const positiveCount = items.filter((a) => a.effect === "POSITIVE").length;
  const negativeCount = items.filter((a) => a.effect === "NEGATIVE").length;
  const pendingCount = items.filter(
    (a) => a.effect === "PENDING" || !a.effect,
  ).length;

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary">
            액션 효과 측정
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            실행한 마케팅 액션의 효과를 추적합니다
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => measure.mutate()}
          disabled={measure.isPending || items.length === 0}
          className="rounded-xl bg-brand hover:bg-brand-dark"
        >
          {measure.isPending ? (
            <Loader2 size={14} className="animate-spin mr-1.5" />
          ) : (
            <Zap size={14} className="mr-1.5" />
          )}
          효과 측정
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className={`${CARD_BASE} p-4 text-center`}>
                <div className="size-7 rounded-lg bg-success-light flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 size={14} className="text-success" />
                </div>
                <p className="text-xl font-black text-success">
                  {positiveCount}
                </p>
                <p className="text-[11px] text-text-tertiary">효과 있음</p>
              </div>
              <div className={`${CARD_BASE} p-4 text-center`}>
                <div className="size-7 rounded-lg bg-danger-light flex items-center justify-center mx-auto mb-2">
                  <XCircle size={14} className="text-danger" />
                </div>
                <p className="text-xl font-black text-danger">
                  {negativeCount}
                </p>
                <p className="text-[11px] text-text-tertiary">효과 없음</p>
              </div>
              <div className={`${CARD_BASE} p-4 text-center`}>
                <div className="size-7 rounded-lg bg-surface-tertiary flex items-center justify-center mx-auto mb-2">
                  <Clock size={14} className="text-text-tertiary" />
                </div>
                <p className="text-xl font-black text-text-secondary">
                  {pendingCount}
                </p>
                <p className="text-[11px] text-text-tertiary">측정 중</p>
              </div>
            </div>
          )}

          {/* 액션 목록 */}
          {items.length === 0 ? (
            <div className={CARD_BASE}>
              <div className="py-16 text-center">
                <div className="size-16 rounded-2xl bg-surface-tertiary flex items-center justify-center mx-auto mb-4">
                  <Activity size={24} className="text-text-tertiary" />
                </div>
                <p className="text-text-secondary font-medium">
                  실행된 액션이 없습니다
                </p>
                <p className="text-sm text-text-tertiary mt-1">
                  대시보드에서 추천 액션을 실행하면 여기에서 효과를 추적합니다
                </p>
              </div>
            </div>
          ) : (
            <div className={`${CARD_BASE} overflow-hidden`}>
              <div className="flex items-center gap-2.5 p-4 pb-3">
                <div className="size-7 rounded-lg bg-info-light flex items-center justify-center">
                  <BarChart3 size={14} className="text-info" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">
                  액션 히스토리
                </h3>
              </div>
              <div className="px-4 pb-4 space-y-2">
                {items.map((action) => {
                  const eff = action.effect
                    ? effectConfig[action.effect]
                    : effectConfig.PENDING;
                  const EffIcon = eff.icon;
                  const rankChanged =
                    action.rankBefore != null && action.rankAfter != null;
                  const rankDiff = rankChanged
                    ? (action.rankBefore as number) -
                      (action.rankAfter as number)
                    : 0;

                  return (
                    <div
                      key={action.id}
                      className="flex items-center gap-3 p-3.5 bg-surface-secondary rounded-xl"
                    >
                      <div
                        className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${eff.bg}`}
                      >
                        <EffIcon size={14} className={eff.color} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary truncate">
                            {action.description}
                          </p>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${eff.bg} ${eff.color}`}
                          >
                            {eff.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-text-tertiary mt-0.5">
                          <span>{action.type}</span>
                          <span>
                            {new Date(action.executedAt).toLocaleDateString(
                              "ko-KR",
                              {
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </span>
                          {action.effectSummary && (
                            <span className={eff.color}>
                              {action.effectSummary}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 순위 변동 */}
                      {rankChanged && (
                        <div className="text-center shrink-0">
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-text-tertiary">
                              {action.rankBefore}위
                            </span>
                            <span className="text-text-tertiary">→</span>
                            <span className="font-bold text-text-primary">
                              {action.rankAfter}위
                            </span>
                          </div>
                          {rankDiff !== 0 && (
                            <span
                              className={`text-[10px] font-medium flex items-center justify-center gap-0.5 ${
                                rankDiff > 0
                                  ? "text-success"
                                  : "text-danger"
                              }`}
                            >
                              {rankDiff > 0 ? (
                                <ArrowUp size={10} />
                              ) : (
                                <ArrowDown size={10} />
                              )}
                              {Math.abs(rankDiff)}칸
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

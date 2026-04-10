"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { CARD_BASE, formatNumber, getKeywordTypeConfig } from "@/lib/design-system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CalendarDays,
  MapPin,
  TrendingUp,
  Plus,
  Loader2,
  Sparkles,
  PartyPopper,
  Search,
} from "lucide-react";

// 시즌 키워드 (type=SEASONAL) 조회
function useSeasonalKeywords(storeId: string) {
  return useQuery({
    queryKey: ["keywords", storeId, "seasonal"],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/keywords`, {
        params: { type: "SEASONAL" },
      });
      return data as Array<{
        id: string;
        keyword: string;
        type: string;
        searchVolume: number | null;
        rank: number | null;
        event?: string;
        startDate?: string;
        endDate?: string;
        location?: string;
      }>;
    },
    enabled: !!storeId,
  });
}

// 실제 축제 데이터 (TourAPI)
function useActiveEvents(storeId: string) {
  return useQuery({
    queryKey: ["events", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/events`);
      return data as Array<{
        id: string;
        name: string;
        region: string | null;
        startDate: string;
        endDate: string;
        keywords: string[];
        description: string | null;
      }>;
    },
    enabled: !!storeId,
    retry: false,
  });
}

// 축제 수집 트리거
function useCollectEvents(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/stores/${storeId}/events/collect`);
      return data;
    },
    onSuccess: (count: number) => {
      qc.invalidateQueries({ queryKey: ["events", storeId] });
      toast.success(`주변 축제 ${count}건 수집 완료`);
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "축제 수집 실패"),
  });
}

function useAddKeyword(storeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keyword: string) => {
      const { data } = await apiClient.post(`/stores/${storeId}/keywords`, {
        keyword,
        type: "SEASONAL",
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keywords", storeId] });
      toast.success("키워드가 추가되었습니다");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "키워드 추가 실패"),
  });
}

function formatDateRange(start?: string, end?: string): string {
  if (!start) return "";
  const s = new Date(start).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
  if (!end) return s;
  const e = new Date(end).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
  return `${s} ~ ${e}`;
}

export default function EventsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: seasonalKeywords, isLoading: kwLoading } =
    useSeasonalKeywords(storeId);
  const { data: activeEvents, isLoading: eventsLoading } =
    useActiveEvents(storeId);
  const collectEvents = useCollectEvents(storeId);
  const addKeyword = useAddKeyword(storeId);

  const keywords = seasonalKeywords ?? [];
  const events = activeEvents ?? [];
  const isLoading = kwLoading || eventsLoading;

  const festivalKeywords = keywords.filter((k: any) => k.event || k.startDate);
  const seasonKeywords = keywords;

  const handleAddKeyword = (keyword: string) => {
    addKeyword.mutate(keyword);
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary">
          시즌 이벤트
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">
          시즌 키워드와 주변 축제를 활용한 마케팅 기회
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* 지금 근처 축제/이벤트 */}
          <div className={`${CARD_BASE} overflow-hidden`}>
            <div className="flex items-center justify-between p-4 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-7 rounded-lg bg-danger-light flex items-center justify-center">
                  <PartyPopper size={14} className="text-danger" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">
                  지금 근처 축제/이벤트
                </h3>
              </div>
              <Button
                variant="outline"
                size="xs"
                onClick={() => collectEvents.mutate()}
                disabled={collectEvents.isPending}
                className="rounded-lg text-xs"
              >
                {collectEvents.isPending ? (
                  <Loader2 size={12} className="animate-spin mr-1" />
                ) : (
                  <CalendarDays size={12} className="mr-1" />
                )}
                축제 수집
              </Button>
            </div>
            <div className="px-4 pb-4">
              {events.length > 0 ? (
                <div className="space-y-2">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 bg-surface-secondary rounded-xl"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="size-7 rounded-lg bg-warning-light flex items-center justify-center shrink-0">
                          <CalendarDays size={14} className="text-warning" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text-primary truncate">
                            {ev.name}
                          </p>
                          <div className="flex items-center gap-3 text-[11px] text-text-tertiary mt-0.5">
                            <span className="flex items-center gap-0.5">
                              <CalendarDays size={10} />
                              {formatDateRange(ev.startDate, ev.endDate)}
                            </span>
                            {ev.region && (
                              <span className="flex items-center gap-0.5">
                                <MapPin size={10} />
                                {ev.region}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {ev.keywords && ev.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 ml-10">
                          {ev.keywords.slice(0, 5).map((kw) => (
                            <button
                              key={kw}
                              onClick={() => addKeyword.mutate(kw)}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-brand-subtle text-brand font-medium hover:bg-brand/20 transition-colors flex items-center gap-0.5"
                            >
                              <Plus size={8} /> {kw}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <div className="size-12 rounded-xl bg-surface-tertiary flex items-center justify-center mx-auto mb-3">
                    <MapPin size={20} className="text-text-tertiary" />
                  </div>
                  <p className="text-sm text-text-secondary font-medium">
                    매장 주소 기반으로 주변 축제를 자동 수집합니다
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    TourAPI 연동을 통해 근처 축제/행사가 자동 반영됩니다
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 시즌 키워드 추천 */}
          <div className={`${CARD_BASE} overflow-hidden`}>
            <div className="flex items-center gap-2.5 p-4 pb-3">
              <div className="size-7 rounded-lg bg-success-light flex items-center justify-center">
                <TrendingUp size={14} className="text-success" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">
                시즌 키워드 추천
              </h3>
            </div>
            <div className="px-4 pb-4">
              {seasonKeywords.length > 0 ? (
                <div className="space-y-2">
                  {seasonKeywords.map((kw) => {
                    const cfg = getKeywordTypeConfig(kw.type);
                    return (
                      <div
                        key={kw.id}
                        className="flex items-center justify-between gap-3 p-3 bg-surface-secondary rounded-xl"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center shrink-0">
                            <Search size={14} className="text-brand" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-text-primary">
                                {kw.keyword}
                              </p>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.color}`}
                              >
                                {cfg.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-text-tertiary mt-0.5">
                              {kw.searchVolume != null && (
                                <span>
                                  월 검색량{" "}
                                  <strong className="text-text-secondary">
                                    {formatNumber(kw.searchVolume)}
                                  </strong>
                                </span>
                              )}
                              {kw.rank != null && (
                                <span>
                                  현재 순위{" "}
                                  <strong className="text-text-secondary">
                                    {kw.rank}위
                                  </strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddKeyword(kw.keyword)}
                          disabled={addKeyword.isPending}
                          className="rounded-xl border-border-primary shrink-0"
                        >
                          {addKeyword.isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Plus size={14} />
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <div className="size-12 rounded-xl bg-surface-tertiary flex items-center justify-center mx-auto mb-3">
                    <CalendarDays size={20} className="text-text-tertiary" />
                  </div>
                  <p className="text-sm text-text-secondary font-medium">
                    시즌 키워드가 없습니다
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    AI가 매장 업종과 시즌에 맞는 키워드를 자동 추천합니다
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CalendarDays, MapPin, Loader2, Sparkles, PartyPopper, Check, Plus,
} from "lucide-react";

type Event = {
  id: string;
  name: string;
  region: string | null;
  startDate: string;
  endDate: string;
  keywords: string[];
  description: string | null;
  status: "ongoing" | "upcoming";
  daysUntilStart: number;
  isNearby: boolean;
  distanceKm: number | null;
};

const RADIUS_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "5km", value: 5 },
  { label: "10km", value: 10 },
  { label: "30km", value: 30 },
  { label: "50km", value: 50 },
  { label: "100km", value: 100 },
  { label: "전체", value: null },
];

type KeywordSuggestion = { keyword: string; reason: string };
type Strategy = {
  idea: string;
  difficulty: "쉬움" | "보통" | "어려움";
  expectedEffect: string;
};

export default function EventsPage() {
  const { storeId } = useCurrentStoreId();
  const [radiusKm, setRadiusKm] = useState<number | null>(30);

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", storeId, radiusKm],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/events`, {
        params: radiusKm != null ? { radiusKm } : {},
      });
      return data as Event[];
    },
    enabled: !!storeId,
  });

  const qc = useQueryClient();
  const collect = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/stores/${storeId}/events/collect`);
      return data as number;
    },
    onSuccess: (count: number) => {
      qc.invalidateQueries({ queryKey: ["events", storeId] });
      toast.success(`주변 축제 ${count}건 수집 완료`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "수집 실패"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const list = events ?? [];
  const ongoing = list.filter((e) => e.status === "ongoing");
  const upcoming = list.filter((e) => e.status === "upcoming");

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">시즌 이벤트</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            내 매장 근방 축제 · 광고 키워드 AI 추천
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => collect.mutate()}
          disabled={collect.isPending}
        >
          {collect.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : <CalendarDays size={14} className="mr-1" />}
          다시 수집
        </Button>
      </div>

      {/* 반경 토글 */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground mr-1">반경</span>
          {RADIUS_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setRadiusKm(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                radiusKm === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white hover:bg-muted/50 border-border"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {radiusKm != null ? `내 매장 반경 ${radiusKm}km 내` : "매장 지역 전체"}
          </span>
        </CardContent>
      </Card>

      {list.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <MapPin size={24} className="mx-auto mb-2 text-muted-foreground/40" />
            <p>내 매장 근방 축제 정보가 없습니다</p>
            <p className="text-xs mt-1">"다시 수집" 버튼을 눌러보세요</p>
          </CardContent>
        </Card>
      )}

      {/* 진행 중 */}
      {ongoing.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Badge className="bg-red-100 text-red-700 border-red-300">진행 중</Badge>
            <span className="text-xs text-muted-foreground">{ongoing.length}건</span>
          </div>
          {ongoing.map((ev) => (
            <EventCard key={ev.id} event={ev} storeId={storeId} />
          ))}
        </div>
      )}

      {/* 다가오는 */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Badge className="bg-muted text-muted-foreground border-border">다가오는 축제</Badge>
            <span className="text-xs text-muted-foreground">{upcoming.length}건 — 미리 키워드 준비하세요</span>
          </div>
          {upcoming.map((ev) => (
            <EventCard key={ev.id} event={ev} storeId={storeId} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event, storeId }: { event: Event; storeId?: string }) {
  const [suggestions, setSuggestions] = useState<KeywordSuggestion[] | null>(null);
  const [strategies, setStrategies] = useState<Strategy[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [addedKeywords, setAddedKeywords] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const suggest = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(
        `/stores/${storeId}/events/${event.id}/suggest-keywords`,
      );
      setSuggestions(data.keywords);
      setStrategies(data.strategies ?? []);
      if (data.keywords.length === 0 && (!data.strategies || data.strategies.length === 0)) {
        toast.info("추천 결과 없음 — 재시도해 보세요");
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || "추천 실패");
    } finally {
      setLoading(false);
    }
  };

  const addAll = async () => {
    if (!suggestions || suggestions.length === 0) return;
    try {
      const { data } = await apiClient.post(
        `/stores/${storeId}/events/add-keywords`,
        { keywords: suggestions.map((s) => s.keyword) },
      );
      toast.success(`${data}개 키워드 추가됨`);
      setAddedKeywords(new Set(suggestions.map((s) => s.keyword)));
      qc.invalidateQueries({ queryKey: ["keywords", storeId] });
    } catch (e: any) {
      toast.error(e.response?.data?.message || "추가 실패");
    }
  };

  const addOne = async (keyword: string) => {
    try {
      await apiClient.post(`/stores/${storeId}/events/add-keywords`, {
        keywords: [keyword],
      });
      toast.success(`"${keyword}" 추가됨`);
      setAddedKeywords((prev) => new Set(prev).add(keyword));
      qc.invalidateQueries({ queryKey: ["keywords", storeId] });
    } catch (e: any) {
      toast.error("추가 실패");
    }
  };

  const dateRange = `${event.startDate.slice(5, 10)} ~ ${event.endDate.slice(5, 10)}`;
  const dLabel =
    event.status === "ongoing"
      ? `${new Date(event.endDate).getDate() - new Date().getDate()}일 남음`
      : `D-${event.daysUntilStart}`;

  return (
    <Card className={event.status === "ongoing" ? "border-red-200" : event.isNearby ? "border-foreground/20" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <PartyPopper size={14} className="text-amber-600 shrink-0" />
              <h3 className="font-bold text-base truncate">{event.name}</h3>
              {event.isNearby && (
                <Badge variant="outline" className="text-[10px] bg-brand-subtle text-brand border-brand/20">
                  같은 지역
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={11} /> {dateRange}
              </span>
              {event.region && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} /> {event.region}
                </span>
              )}
              {event.distanceKm != null && (
                <Badge variant="outline" className={`text-[10px] ${event.distanceKm <= 10 ? "bg-brand-subtle text-brand border-brand/20" : "bg-muted text-muted-foreground border-border"}`}>
                  📍 {event.distanceKm}km
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {dLabel}
              </Badge>
            </div>
            {event.description && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{event.description}</p>
            )}
          </div>
          <Button
            size="sm"
            variant={suggestions ? "outline" : "default"}
            onClick={suggest}
            disabled={loading}
          >
            {loading ? <Loader2 size={12} className="animate-spin mr-1" /> : <Sparkles size={12} className="mr-1" />}
            {suggestions ? "다시 추천" : "광고 키워드 추천"}
          </Button>
        </div>

        {suggestions && suggestions.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                AI 추천 광고 키워드 ({suggestions.length}개)
              </span>
              <Button size="xs" variant="outline" onClick={addAll}>
                <Plus size={10} className="mr-1" /> 모두 추가
              </Button>
            </div>
            <div className="space-y-1.5">
              {suggestions.map((s, i) => {
                const added = addedKeywords.has(s.keyword);
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-xs ${
                      added ? "bg-green-50 border-green-200" : "bg-muted/30 border-border"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground">{s.keyword}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{s.reason}</div>
                    </div>
                    {added ? (
                      <Badge className="bg-green-100 text-green-700 border-green-300 shrink-0">
                        <Check size={10} className="mr-0.5" /> 추가됨
                      </Badge>
                    ) : (
                      <Button size="xs" variant="ghost" onClick={() => addOne(s.keyword)} className="shrink-0">
                        <Plus size={11} />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI 맞춤 전략 — 키워드만으로는 손님이 오지 않음. 매장 행동 제안. */}
        {/* DESIGN-apple §10: Paperlogy / keep-all / -0.018em / 8px radius / 36px+ 터치 */}
        {strategies && strategies.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-brand" />
              <span className="text-xs font-semibold text-foreground tracking-tight">
                AI 맞춤 전략 ({strategies.length}개)
              </span>
              <span className="text-[10px] text-muted-foreground ml-1">— 매장에서 직접 준비할 행동</span>
            </div>
            <div className="space-y-1.5">
              {strategies.map((st, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-white px-3 py-2.5 break-keep"
                >
                  <div className="flex items-start gap-2">
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] py-0 px-1.5 ${
                        st.difficulty === "쉬움"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : st.difficulty === "보통"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                    >
                      {st.difficulty}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground leading-snug">
                        {st.idea}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        💡 {st.expectedEffect}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

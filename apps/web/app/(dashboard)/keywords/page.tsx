"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RankHistoryChart } from "@/components/charts/rank-history-chart";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useKeywords } from "@/hooks/useKeywords";
import { useRankHistory, useRankCheck } from "@/hooks/useRankHistory";
import { useTrafficShift, useRecordVolumes } from "@/hooks/useTrafficShift";
import { apiClient } from "@/lib/api-client";
import { getKeywordTypeConfig, getTrendStyle, formatNumber, CHART_COLORS } from "@/lib/design-system";
import { toast } from "sonner";
import { RankGridTable } from "@/components/keywords/rank-grid-table";
import { TrendingUp, TrendingDown, Minus, Plus, Search, Loader2, RefreshCw, BarChart3, Hash, ArrowUpRight, ArrowDownRight, Sparkles, Lightbulb, ArrowRight, Activity } from "lucide-react";

export default function KeywordsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: keywords, isLoading, refetch } = useKeywords(storeId);
  const { data: rankData } = useRankHistory(storeId, 7);
  const rankCheck = useRankCheck(storeId);
  const { data: trafficShift, refetch: refetchShift, isLoading: shiftLoading } = useTrafficShift(storeId);
  const recordVolumes = useRecordVolumes(storeId);
  const [newKeyword, setNewKeyword] = useState("");
  const [adding, setAdding] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredKeywords, setDiscoveredKeywords] = useState<any>(null);

  const handleRecordVolumes = () => {
    recordVolumes.mutate(undefined, {
      onSuccess: (count) => {
        toast.success(`검색량 ${count}건 기록됨 — 누적 2주 후 트래픽 이동 분석 가능`);
        refetchShift();
      },
      onError: (e: any) =>
        toast.error("기록 실패: " + (e.response?.data?.message || e.message)),
    });
  };

  const handleAdd = async () => {
    if (!newKeyword.trim() || !storeId) return;
    setAdding(true);
    try {
      await apiClient.post(`/stores/${storeId}/keywords`, {
        keyword: newKeyword.trim(),
        type: "USER_ADDED",
      });
      toast.success(`"${newKeyword.trim()}" 키워드가 추가되었습니다`);
      setNewKeyword("");
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "키워드 추가에 실패했습니다");
    } finally {
      setAdding(false);
    }
  };

  const handleRankCheck = () => {
    rankCheck.mutate(undefined, {
      onSuccess: (data: any) => {
        toast.success(`순위 체크 완료! ${data.results?.length ?? 0}개 키워드`);
        refetch();
      },
      onError: (e: any) => toast.error("순위 체크 실패: " + (e.response?.data?.message || e.message)),
    });
  };

  const handleRefreshVolume = async () => {
    try {
      toast.info("검색량을 조회하고 있습니다...");
      await apiClient.post(`/stores/${storeId}/keywords/refresh-volume`);
      toast.success("검색량 업데이트 완료!");
      refetch();
    } catch (e: any) {
      toast.error("검색량 조회 실패");
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      toast.info("AI가 히든 키워드를 발굴하고 있습니다...");
      const { data } = await apiClient.post(`/stores/${storeId}/keywords/discover`);
      setDiscoveredKeywords(data);
      toast.success(`${(data.discovered?.length || 0) + (data.aiRecommended?.length || 0)}개 키워드 발견!`);
    } catch (e: any) {
      toast.error("키워드 발굴 실패: " + (e.response?.data?.message || e.message));
    } finally {
      setDiscovering(false);
    }
  };

  const handleAddDiscovered = async (keyword: string) => {
    try {
      await apiClient.post(`/stores/${storeId}/keywords`, { keyword, type: "HIDDEN" });
      toast.success(`"${keyword}" 추가됨`);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "추가 실패");
    }
  };

  const kws = keywords ?? [];
  const upCount = kws.filter((k: any) => k.trendDirection === "UP").length;
  const downCount = kws.filter((k: any) => k.trendDirection === "DOWN").length;
  const avgRank = kws.filter((k: any) => k.currentRank).length > 0
    ? Math.round(kws.filter((k: any) => k.currentRank).reduce((s: number, k: any) => s + k.currentRank, 0) / kws.filter((k: any) => k.currentRank).length)
    : null;

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary">키워드 분석</h2>
          <p className="text-sm text-text-secondary mt-0.5">{kws.length}개 키워드 추적 중</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshVolume} className="rounded-xl">
            <RefreshCw size={14} className="mr-1.5" />
            검색량 조회
          </Button>
          <Button size="sm" onClick={handleRankCheck} disabled={rankCheck.isPending || kws.length === 0} className="rounded-xl bg-brand hover:bg-brand-dark">
            {rankCheck.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Search size={14} className="mr-1.5" />}
            순위 체크
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center">
              <Hash size={14} className="text-brand" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-primary">{kws.length}</p>
          <p className="text-xs text-text-tertiary">추적 키워드</p>
        </div>
        <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="size-7 rounded-lg bg-success-light flex items-center justify-center">
              <ArrowUpRight size={14} className="text-success" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-success">{upCount}</p>
          <p className="text-xs text-text-tertiary">순위 상승</p>
        </div>
        <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="size-7 rounded-lg bg-danger-light flex items-center justify-center">
              <ArrowDownRight size={14} className="text-danger" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-danger">{downCount}</p>
          <p className="text-xs text-text-tertiary">순위 하락</p>
        </div>
        <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="size-7 rounded-lg bg-violet-100 flex items-center justify-center">
              <BarChart3 size={14} className="text-violet-600" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-text-primary">{avgRank ?? "-"}</p>
          <p className="text-xs text-text-tertiary">평균 순위</p>
        </div>
      </div>

      {/* 키워드 추가 */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="키워드 추가 (예: 청주 맛집)"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="pl-10 rounded-xl h-11"
          />
        </div>
        <Button onClick={handleAdd} disabled={adding || !newKeyword.trim()} className="rounded-xl h-11 px-5 bg-brand hover:bg-brand-dark">
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
        </Button>
      </div>

      {/* 순위 차트 — 순위 잡힌 키워드 우선, 부족하면 검색량 순으로 채움 */}
      {kws.length > 0 && (() => {
        const ranked = kws.filter((k: any) => k.currentRank != null);
        const unranked = kws.filter((k: any) => k.currentRank == null);
        const chartKeywords = [...ranked, ...unranked].slice(0, 5).map((k: any) => k.keyword);
        return (
          <RankHistoryChart
            data={rankData ?? []}
            keywords={chartKeywords}
            isLoading={false}
          />
        );
      })()}

      {/* 일별 순위 추이 그리드 */}
      {storeId && <RankGridTable storeId={storeId} />}

      {/* 키워드 목록 */}
      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : kws.length === 0 ? (
        <div className="rounded-2xl border border-border-primary bg-surface shadow-sm">
          <div className="py-16 text-center">
            <div className="size-16 rounded-2xl bg-brand-subtle flex items-center justify-center mx-auto mb-4">
              <Search size={24} className="text-brand" />
            </div>
            <p className="text-text-secondary font-medium">추적 중인 키워드가 없습니다</p>
            <p className="text-sm text-text-tertiary mt-1">위에서 키워드를 추가해보세요</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {kws.map((kw: any, i: number) => {
            const badge = getKeywordTypeConfig(kw.type);
            const rankDiff = kw.previousRank && kw.currentRank ? kw.previousRank - kw.currentRank : null;
            const trend = getTrendStyle(kw.trendDirection);
            return (
              <div key={kw.id || i} className="rounded-2xl border border-border-primary bg-surface shadow-sm hover:shadow-md transition-all">
                <div className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    {/* 좌측: 키워드 정보 */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="size-8 rounded-lg bg-surface-secondary flex items-center justify-center shrink-0 text-xs font-bold text-text-tertiary">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate text-text-primary">{kw.keyword}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>
                        </div>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          월 검색량 <span className="font-semibold text-text-primary">{formatNumber(kw.monthlySearchVolume)}</span>
                        </p>
                      </div>
                    </div>

                    {/* 우측: 순위 + 트렌드 */}
                    <div className="flex items-center gap-4 shrink-0">
                      {kw.currentRank ? (
                        <div className="text-right">
                          <div className="flex items-center gap-1.5">
                            <span className="text-lg font-bold text-text-primary">{kw.currentRank}</span>
                            <span className="text-xs text-text-tertiary">위</span>
                          </div>
                          {rankDiff !== null && rankDiff !== 0 && (
                            <span className={`text-xs font-medium ${rankDiff > 0 ? "text-success" : "text-danger"}`}>
                              {rankDiff > 0 ? `+${rankDiff} ↑` : `${rankDiff} ↓`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-text-tertiary">-위</span>
                      )}

                      {kw.trendDirection === "UP" && (
                        <div className="size-7 rounded-lg bg-success-light flex items-center justify-center">
                          <TrendingUp size={14} className="text-success" />
                        </div>
                      )}
                      {kw.trendDirection === "DOWN" && (
                        <div className="size-7 rounded-lg bg-danger-light flex items-center justify-center">
                          <TrendingDown size={14} className="text-danger" />
                        </div>
                      )}
                      {kw.trendDirection === "STABLE" && (
                        <div className="size-7 rounded-lg bg-surface-secondary flex items-center justify-center">
                          <Minus size={14} className="text-text-tertiary" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* === 검색 트래픽 이동 분석 === */}
      <div className="rounded-2xl border border-border-primary bg-surface shadow-sm">
        <div className="p-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-info-light flex items-center justify-center">
                <Activity size={14} className="text-info" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">검색 트래픽 이동 분석</p>
                <p className="text-xs text-text-tertiary">
                  감소 키워드 → 후보 키워드 + AI 해석 (15% 이상 하락 시)
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRecordVolumes}
              disabled={recordVolumes.isPending || kws.length === 0}
              className="rounded-xl"
            >
              {recordVolumes.isPending ? (
                <Loader2 size={12} className="animate-spin mr-1.5" />
              ) : (
                <RefreshCw size={12} className="mr-1.5" />
              )}
              검색량 기록
            </Button>
          </div>

          {shiftLoading ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : !trafficShift || trafficShift.length === 0 ? (
            <div className="text-center py-6 px-3">
              <p className="text-xs text-text-tertiary">
                감소 임계치(-15%) 이하 키워드가 없습니다
              </p>
              <p className="text-xs text-text-tertiary mt-1">
                "검색량 기록" 버튼을 매일 눌러 누적 데이터를 만드세요 (2주 이상 필요)
              </p>
            </div>
          ) : (
            <div className="space-y-3 mt-3">
              {trafficShift.map((shift, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl border border-border-primary bg-surface-secondary"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-danger">
                      {shift.sourceKeyword}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {formatNumber(shift.sourcePrevious)} →{" "}
                      {formatNumber(shift.sourceCurrent)}
                    </span>
                    <span className="text-xs font-semibold text-danger">
                      ({shift.sourceDropRate}%)
                    </span>
                  </div>
                  {shift.candidates.length > 0 && (
                    <div className="mt-2 pl-2 border-l-2 border-info">
                      <p className="text-xs font-semibold text-info mb-1 flex items-center gap-1">
                        <ArrowRight size={10} />
                        후보 키워드 (검색량 상승)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {shift.candidates.map((c, j) => (
                          <span
                            key={j}
                            className="text-xs px-2 py-0.5 rounded-lg bg-info-light text-info"
                          >
                            {c.keyword}
                            {!Number.isNaN(c.gainRate) && (
                              <span className="ml-1 text-success font-semibold">
                                +{c.gainRate}%
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {shift.interpretation && (
                    <div className="mt-2 p-2 rounded-lg bg-surface border border-border-primary">
                      <p className="text-xs font-semibold text-violet-600 flex items-center gap-1 mb-0.5">
                        <Sparkles size={10} />
                        AI 해석
                      </p>
                      <p className="text-xs text-text-primary leading-relaxed">
                        {shift.interpretation}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI 키워드 발굴 */}
      <div className="rounded-2xl border border-border-primary bg-surface shadow-sm">
        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-warning-light flex items-center justify-center">
                <Lightbulb size={14} className="text-warning" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">AI 히든 키워드 발굴</p>
                <p className="text-xs text-text-tertiary">경쟁자가 놓치고 있는 틈새 키워드 찾기</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleDiscover}
              disabled={discovering}
              className="rounded-xl bg-brand hover:bg-brand-dark"
            >
              {discovering ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />}
              발굴하기
            </Button>
          </div>

          {discoveredKeywords && (
            <div className="space-y-3 mt-4">
              {/* 히든 키워드 */}
              {discoveredKeywords.hidden?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-warning mb-2">히든 키워드 (경쟁 낮음 + 검색량 적정)</p>
                  <div className="flex flex-wrap gap-2">
                    {discoveredKeywords.hidden.map((k: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => handleAddDiscovered(k.keyword)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-warning-light text-warning hover:opacity-80 transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={10} /> {k.keyword}
                        <span className="text-[10px] opacity-60">{formatNumber(k.monthlyVolume)}/월</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* AI 추천 */}
              {discoveredKeywords.aiRecommended?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-violet-600 mb-2">AI 추천 키워드</p>
                  <div className="flex flex-wrap gap-2">
                    {discoveredKeywords.aiRecommended.map((k: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => handleAddDiscovered(k.keyword)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-violet-100 text-violet-700 hover:opacity-80 transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={10} /> {k.keyword}
                        <span className="text-[10px] opacity-60">{formatNumber(k.monthlyVolume)}/월</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 연관 키워드 */}
              {discoveredKeywords.discovered?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-brand mb-2">연관 키워드 (검색량 순)</p>
                  <div className="flex flex-wrap gap-2">
                    {discoveredKeywords.discovered.slice(0, 10).map((k: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => handleAddDiscovered(k.keyword)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-brand-subtle text-brand hover:opacity-80 transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={10} /> {k.keyword}
                        <span className="text-[10px] opacity-60">{formatNumber(k.monthlyVolume)}/월</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

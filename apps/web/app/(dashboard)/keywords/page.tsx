"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RankHistoryChart } from "@/components/charts/rank-history-chart";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useKeywords } from "@/hooks/useKeywords";
import { useRankHistory, useRankCheck } from "@/hooks/useRankHistory";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Minus, Plus, Search, Loader2, RefreshCw, BarChart3, Hash, ArrowUpRight, ArrowDownRight, Sparkles, Lightbulb } from "lucide-react";

const typeBadge: Record<string, { label: string; color: string }> = {
  MAIN: { label: "대표", color: "bg-blue-100 text-blue-700" },
  AI_RECOMMENDED: { label: "AI추천", color: "bg-violet-100 text-violet-700" },
  HIDDEN: { label: "히든", color: "bg-amber-100 text-amber-700" },
  SEASONAL: { label: "시즌", color: "bg-emerald-100 text-emerald-700" },
  USER_ADDED: { label: "직접추가", color: "bg-gray-100 text-gray-700" },
};

export default function KeywordsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: keywords, isLoading, refetch } = useKeywords(storeId);
  const { data: rankData } = useRankHistory(storeId, 7);
  const rankCheck = useRankCheck(storeId);
  const [newKeyword, setNewKeyword] = useState("");
  const [adding, setAdding] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredKeywords, setDiscoveredKeywords] = useState<any>(null);

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
    <div className="space-y-5 md:space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">키워드 분석</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{kws.length}개 키워드 추적 중</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshVolume} className="rounded-xl">
            <RefreshCw size={14} className="mr-1.5" />
            검색량 조회
          </Button>
          <Button size="sm" onClick={handleRankCheck} disabled={rankCheck.isPending || kws.length === 0} className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-md">
            {rankCheck.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Search size={14} className="mr-1.5" />}
            순위 체크
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <div className="flex items-center justify-between mb-1">
              <Hash size={14} className="text-blue-500" />
            </div>
            <p className="text-2xl font-extrabold">{kws.length}</p>
            <p className="text-[11px] text-muted-foreground">추적 키워드</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
            <div className="flex items-center justify-between mb-1">
              <ArrowUpRight size={14} className="text-emerald-500" />
            </div>
            <p className="text-2xl font-extrabold text-emerald-600">{upCount}</p>
            <p className="text-[11px] text-muted-foreground">순위 상승</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-rose-500/10 to-rose-500/5">
            <div className="flex items-center justify-between mb-1">
              <ArrowDownRight size={14} className="text-rose-500" />
            </div>
            <p className="text-2xl font-extrabold text-rose-600">{downCount}</p>
            <p className="text-[11px] text-muted-foreground">순위 하락</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-violet-500/10 to-violet-500/5">
            <div className="flex items-center justify-between mb-1">
              <BarChart3 size={14} className="text-violet-500" />
            </div>
            <p className="text-2xl font-extrabold">{avgRank ?? "-"}</p>
            <p className="text-[11px] text-muted-foreground">평균 순위</p>
          </CardContent>
        </Card>
      </div>

      {/* 키워드 추가 */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="키워드 추가 (예: 청주 맛집)"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="pl-10 rounded-xl h-11"
          />
        </div>
        <Button onClick={handleAdd} disabled={adding || !newKeyword.trim()} className="rounded-xl h-11 px-5">
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
        </Button>
      </div>

      {/* 순위 차트 */}
      {kws.length > 0 && (
        <RankHistoryChart
          data={rankData ?? []}
          keywords={kws.slice(0, 3).map((k: any) => k.keyword)}
          isLoading={false}
        />
      )}

      {/* 키워드 목록 */}
      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : kws.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <Search size={24} className="text-blue-400" />
            </div>
            <p className="text-muted-foreground font-medium">추적 중인 키워드가 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">위에서 키워드를 추가해보세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {kws.map((kw: any, i: number) => {
            const badge = typeBadge[kw.type] ?? { label: kw.type, color: "bg-gray-100 text-gray-700" };
            const rankDiff = kw.previousRank && kw.currentRank ? kw.previousRank - kw.currentRank : null;
            return (
              <Card key={kw.id || i} className="overflow-hidden hover:shadow-md transition-all">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    {/* 좌측: 키워드 정보 */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{kw.keyword}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          월 검색량 <span className="font-semibold text-foreground">{kw.monthlySearchVolume?.toLocaleString() ?? "-"}</span>
                        </p>
                      </div>
                    </div>

                    {/* 우측: 순위 + 트렌드 */}
                    <div className="flex items-center gap-4 shrink-0">
                      {kw.currentRank ? (
                        <div className="text-right">
                          <div className="flex items-center gap-1.5">
                            <span className="text-lg font-bold">{kw.currentRank}</span>
                            <span className="text-xs text-muted-foreground">위</span>
                          </div>
                          {rankDiff !== null && rankDiff !== 0 && (
                            <span className={`text-[11px] font-medium ${rankDiff > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              {rankDiff > 0 ? `+${rankDiff} ↑` : `${rankDiff} ↓`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-위</span>
                      )}

                      {kw.trendDirection === "UP" && (
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <TrendingUp size={14} className="text-emerald-600" />
                        </div>
                      )}
                      {kw.trendDirection === "DOWN" && (
                        <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                          <TrendingDown size={14} className="text-rose-600" />
                        </div>
                      )}
                      {kw.trendDirection === "STABLE" && (
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Minus size={14} className="text-gray-500" />
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* AI 키워드 발굴 */}
      <Card className="rounded-2xl overflow-hidden">
        <CardContent className="pt-5 pb-4 px-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Lightbulb size={14} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold">AI 히든 키워드 발굴</p>
                <p className="text-[11px] text-muted-foreground">경쟁자가 놓치고 있는 틈새 키워드 찾기</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleDiscover}
              disabled={discovering}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-md"
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
                  <p className="text-xs font-semibold text-amber-600 mb-2">히든 키워드 (경쟁 낮음 + 검색량 적정)</p>
                  <div className="flex flex-wrap gap-2">
                    {discoveredKeywords.hidden.map((k: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => handleAddDiscovered(k.keyword)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={10} /> {k.keyword}
                        <span className="text-[10px] opacity-60">{k.monthlyVolume?.toLocaleString()}/월</span>
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
                        className="text-xs px-3 py-1.5 rounded-xl bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={10} /> {k.keyword}
                        <span className="text-[10px] opacity-60">{k.monthlyVolume?.toLocaleString()}/월</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 연관 키워드 */}
              {discoveredKeywords.discovered?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-600 mb-2">연관 키워드 (검색량 순)</p>
                  <div className="flex flex-wrap gap-2">
                    {discoveredKeywords.discovered.slice(0, 10).map((k: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => handleAddDiscovered(k.keyword)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={10} /> {k.keyword}
                        <span className="text-[10px] opacity-60">{k.monthlyVolume?.toLocaleString()}/월</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

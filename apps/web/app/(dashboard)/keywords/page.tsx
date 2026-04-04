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
import { TrendingUp, TrendingDown, Minus, Plus, Search, Loader2 } from "lucide-react";

const typeBadge: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  MAIN: { label: "대표", variant: "default" },
  AI_RECOMMENDED: { label: "AI추천", variant: "secondary" },
  HIDDEN: { label: "히든", variant: "outline" },
  SEASONAL: { label: "시즌", variant: "secondary" },
  USER_ADDED: { label: "직접추가", variant: "outline" },
};

export default function KeywordsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: keywords, isLoading, refetch } = useKeywords(storeId);
  const { data: rankData } = useRankHistory(storeId, 7);
  const rankCheck = useRankCheck(storeId);
  const [newKeyword, setNewKeyword] = useState("");
  const [adding, setAdding] = useState(false);

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

  const kws = keywords ?? [];
  const upCount = kws.filter((k: any) => k.trendDirection === "UP").length;
  const downCount = kws.filter((k: any) => k.trendDirection === "DOWN").length;

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">키워드 분석</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshVolume}>
            검색량 조회
          </Button>
          <Button size="sm" onClick={handleRankCheck} disabled={rankCheck.isPending || kws.length === 0}>
            {rankCheck.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : <Search size={14} className="mr-1" />}
            순위 체크
          </Button>
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold">{kws.length}</p><p className="text-xs text-muted-foreground">추적 키워드</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-green-500">{upCount}</p><p className="text-xs text-muted-foreground">상승</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-red-500">{downCount}</p><p className="text-xs text-muted-foreground">하락</p></CardContent></Card>
      </div>

      {/* 키워드 추가 */}
      <div className="flex gap-2">
        <Input
          placeholder="키워드 추가 (예: 청주 맛집)"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={adding || !newKeyword.trim()}>
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </Button>
      </div>

      {/* 순위 차트 — 실데이터 */}
      <RankHistoryChart
        data={rankData ?? []}
        keywords={kws.slice(0, 3).map((k: any) => k.keyword)}
        isLoading={false}
      />

      {/* 키워드 테이블 */}
      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : kws.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">추적 중인 키워드가 없습니다. 위에서 키워드를 추가해보세요.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">키워드</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">월 검색량</th>
                    <th className="text-center p-3 font-medium text-muted-foreground hidden md:table-cell">순위</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">트렌드</th>
                  </tr>
                </thead>
                <tbody>
                  {kws.map((kw: any, i: number) => {
                    const badge = typeBadge[kw.type] ?? { label: kw.type, variant: "outline" as const };
                    const rankDiff = kw.previousRank && kw.currentRank ? kw.previousRank - kw.currentRank : null;
                    return (
                      <tr key={kw.id || i} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{kw.keyword}</span>
                            <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                          </div>
                        </td>
                        <td className="p-3 text-center font-medium">{kw.monthlySearchVolume?.toLocaleString() ?? "-"}</td>
                        <td className="p-3 text-center hidden md:table-cell">
                          {kw.currentRank ? (
                            <span className="flex items-center justify-center gap-1">
                              {kw.currentRank}위
                              {rankDiff !== null && rankDiff > 0 && <span className="text-xs text-green-500">+{rankDiff}</span>}
                              {rankDiff !== null && rankDiff < 0 && <span className="text-xs text-red-500">{rankDiff}</span>}
                            </span>
                          ) : "-"}
                        </td>
                        <td className="p-3 text-center">
                          {kw.trendDirection === "UP" && <span className="flex items-center justify-center gap-0.5 text-green-500 text-xs font-medium"><TrendingUp size={14} /> +{kw.trendPercentage}%</span>}
                          {kw.trendDirection === "DOWN" && <span className="flex items-center justify-center gap-0.5 text-red-500 text-xs font-medium"><TrendingDown size={14} /> {kw.trendPercentage}%</span>}
                          {kw.trendDirection === "STABLE" && <span className="flex items-center justify-center text-muted-foreground text-xs"><Minus size={14} /></span>}
                          {!kw.trendDirection && <span className="text-muted-foreground">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

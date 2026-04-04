"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitorRadarChart } from "@/components/charts/competitor-radar-chart";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useCompetitors, useAddCompetitor, useDeleteCompetitor, useCompetitorComparison } from "@/hooks/useCompetitors";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, RefreshCw, Trophy, Users, MessageSquare, Search, Crown, ArrowUp, ArrowDown } from "lucide-react";

export default function CompetitorsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: competitors, isLoading, refetch } = useCompetitors(storeId);
  const { data: comparison } = useCompetitorComparison(storeId);
  const addComp = useAddCompetitor(storeId);
  const deleteComp = useDeleteCompetitor(storeId);
  const [newName, setNewName] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const comps = competitors ?? [];
  const myStore = comparison?.store;
  const compData = comparison?.competitors ?? [];

  const handleAdd = () => {
    if (!newName.trim()) return;
    addComp.mutate({ competitorName: newName.trim() }, {
      onSuccess: () => { toast.success(`"${newName.trim()}" 추가됨. 데이터 수집 중...`); setNewName(""); },
      onError: (e: any) => toast.error(e.response?.data?.message || "추가 실패"),
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      toast.info("경쟁 매장 데이터를 수집하고 있습니다...");
      await apiClient.post(`/stores/${storeId}/competitors/refresh`);
      toast.success("경쟁 매장 데이터 수집 완료!");
      refetch();
    } catch {
      toast.error("데이터 수집 실패");
    } finally {
      setRefreshing(false);
    }
  };

  const firstComp = compData[0];
  const radarData = firstComp && myStore ? [
    { metric: "블로그 리뷰", myStore: myStore.blogReviewCount ?? 0, competitor: firstComp.blogReviewCount ?? 0 },
    { metric: "영수증 리뷰", myStore: myStore.receiptReviewCount ?? 0, competitor: firstComp.receiptReviewCount ?? 0 },
    { metric: "일 검색량", myStore: myStore.dailySearchVolume ?? 0, competitor: firstComp.dailySearchVolume ?? 0 },
  ] : [];

  const CompareCell = ({ my, their, unit }: { my: number; their: number; unit: string }) => {
    const diff = my - their;
    return (
      <div className="text-center">
        <p className="text-sm font-bold">{their.toLocaleString()}<span className="text-[10px] text-muted-foreground font-normal">{unit}</span></p>
        {diff !== 0 && (
          <span className={`text-[10px] font-medium flex items-center justify-center gap-0.5 ${diff > 0 ? "text-emerald-500" : "text-rose-500"}`}>
            {diff > 0 ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
            {Math.abs(diff).toLocaleString()}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 md:space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">경쟁 비교</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{comps.length}개 경쟁 매장 추적 중</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || comps.length === 0} className="rounded-xl">
          {refreshing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <RefreshCw size={14} className="mr-1.5" />}
          데이터 수집
        </Button>
      </div>

      {/* 경쟁매장 추가 */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="경쟁 매장명 입력 (예: 옆집 고깃집)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="pl-10 rounded-xl h-11"
          />
        </div>
        <Button onClick={handleAdd} disabled={addComp.isPending || !newName.trim()} className="rounded-xl h-11 px-5">
          {addComp.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
        </Button>
      </div>

      {/* 내 매장 vs 경쟁매장 요약 */}
      {myStore && compData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 내 매장 카드 */}
          <Card className="overflow-hidden border-2 border-primary/20">
            <CardContent className="pt-4 pb-3 px-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/5">
              <div className="flex items-center gap-2 mb-3">
                <Crown size={16} className="text-primary" />
                <span className="text-sm font-bold">내 매장</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">영수증 리뷰</span>
                  <span className="font-bold">{(myStore.receiptReviewCount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">블로그 리뷰</span>
                  <span className="font-bold">{(myStore.blogReviewCount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">일 검색량</span>
                  <span className="font-bold">{(myStore.dailySearchVolume ?? 0).toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 경쟁매장 TOP 2 */}
          {compData.slice(0, 2).map((c: any, i: number) => (
            <Card key={c.id || i} className="overflow-hidden">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-rose-600">{i + 1}</span>
                  </div>
                  <span className="text-sm font-bold truncate">{c.name}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">영수증 리뷰</span>
                    <CompareCell my={myStore.receiptReviewCount ?? 0} their={c.receiptReviewCount ?? 0} unit="" />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">블로그 리뷰</span>
                    <CompareCell my={myStore.blogReviewCount ?? 0} their={c.blogReviewCount ?? 0} unit="" />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">일 검색량</span>
                    <CompareCell my={myStore.dailySearchVolume ?? 0} their={c.dailySearchVolume ?? 0} unit="" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 레이더 차트 */}
      {radarData.length > 0 && (
        <CompetitorRadarChart
          data={radarData}
          myStoreName={myStore?.name ?? "내 매장"}
          competitorName={firstComp?.name ?? "경쟁매장"}
        />
      )}

      {/* 경쟁 매장 목록 */}
      {isLoading ? <Skeleton className="h-48 w-full rounded-2xl" /> : comps.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-4">
              <Users size={24} className="text-rose-400" />
            </div>
            <p className="text-muted-foreground font-medium">등록된 경쟁 매장이 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">위에서 경쟁 매장을 추가하세요</p>
          </CardContent>
        </Card>
      ) : (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">전체 경쟁 매장 ({comps.length})</h3>
          <div className="space-y-2">
            {comps.map((c: any, i: number) => (
              <Card key={c.id || i} className="overflow-hidden hover:shadow-md transition-all">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                        c.type === "AUTO" ? "bg-violet-100 text-violet-600" : "bg-blue-100 text-blue-600"
                      }`}>
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate">{c.competitorName}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            c.type === "AUTO" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-700"
                          }`}>
                            {c.type === "AUTO" ? "AI추천" : "직접추가"}
                          </span>
                        </div>
                        <div className="flex gap-3 text-[11px] text-muted-foreground mt-1">
                          {c.blogReviewCount != null && <span className="flex items-center gap-0.5"><MessageSquare size={10} /> 블로그 {c.blogReviewCount}</span>}
                          {c.receiptReviewCount != null && <span className="flex items-center gap-0.5"><Users size={10} /> 방문자 {c.receiptReviewCount}</span>}
                          {c.dailySearchVolume != null && <span className="flex items-center gap-0.5"><Search size={10} /> {c.dailySearchVolume}/일</span>}
                          {!c.blogReviewCount && !c.receiptReviewCount && (
                            <span className="text-amber-500 font-medium">"데이터 수집" 버튼을 눌러주세요</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteComp.mutate(c.id, {
                        onSuccess: () => toast.success("삭제됨"),
                        onError: () => toast.error("삭제 실패"),
                      })}
                      className="text-muted-foreground hover:text-destructive shrink-0 rounded-xl"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

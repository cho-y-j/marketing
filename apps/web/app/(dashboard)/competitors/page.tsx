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
import { Plus, Trash2, Loader2, RefreshCw, Trophy } from "lucide-react";

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

  // 레이더 차트 — 첫 번째 경쟁매장과 비교
  const firstComp = compData[0];
  const radarData = firstComp && myStore ? [
    { metric: "블로그 리뷰", myStore: myStore.blogReviewCount ?? 0, competitor: firstComp.blogReviewCount ?? 0 },
    { metric: "영수증 리뷰", myStore: myStore.receiptReviewCount ?? 0, competitor: firstComp.receiptReviewCount ?? 0 },
    { metric: "일 검색량", myStore: myStore.dailySearchVolume ?? 0, competitor: firstComp.dailySearchVolume ?? 0 },
  ] : [];

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">경쟁 비교</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || comps.length === 0}>
            {refreshing ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
            데이터 수집
          </Button>
          <Badge variant="secondary">{comps.length}개 매장</Badge>
        </div>
      </div>

      {/* 경쟁매장 추가 */}
      <div className="flex gap-2">
        <Input placeholder="경쟁 매장명 입력 (예: 옆집 고깃집)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <Button onClick={handleAdd} disabled={addComp.isPending || !newName.trim()}>
          {addComp.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </Button>
      </div>

      {/* 레이더 차트 */}
      {radarData.length > 0 && (
        <CompetitorRadarChart
          data={radarData}
          myStoreName={myStore?.name ?? "내 매장"}
          competitorName={firstComp?.name ?? "경쟁매장"}
        />
      )}

      {/* 비교 테이블 */}
      {compData.length > 0 && myStore && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">경쟁 비교 테이블</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground">매장</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">영수증 리뷰</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">블로그 리뷰</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">일 검색량</th>
                </tr>
              </thead>
              <tbody>
                {/* 내 매장 */}
                <tr className="border-b bg-primary/5">
                  <td className="p-3 font-medium flex items-center gap-2">
                    <Trophy size={14} className="text-primary" />
                    {myStore.name}
                  </td>
                  <td className="p-3 text-center font-medium">{myStore.receiptReviewCount?.toLocaleString() ?? "-"}</td>
                  <td className="p-3 text-center font-medium">{myStore.blogReviewCount?.toLocaleString() ?? "-"}</td>
                  <td className="p-3 text-center font-medium">{myStore.dailySearchVolume?.toLocaleString() ?? "-"}</td>
                </tr>
                {/* 경쟁 매장 */}
                {compData.map((c: any, i: number) => (
                  <tr key={c.id || i} className="border-b last:border-0">
                    <td className="p-3">
                      <span className="font-medium">{c.name}</span>
                      <Badge variant={c.type === "AUTO" ? "secondary" : "outline"} className="text-[10px] ml-2">
                        {c.type === "AUTO" ? "AI" : "직접"}
                      </Badge>
                    </td>
                    <td className={`p-3 text-center ${(c.receiptReviewCount ?? 0) > (myStore.receiptReviewCount ?? 0) ? "text-red-500 font-medium" : ""}`}>
                      {c.receiptReviewCount?.toLocaleString() ?? "-"}
                    </td>
                    <td className={`p-3 text-center ${(c.blogReviewCount ?? 0) > (myStore.blogReviewCount ?? 0) ? "text-red-500 font-medium" : ""}`}>
                      {c.blogReviewCount?.toLocaleString() ?? "-"}
                    </td>
                    <td className={`p-3 text-center ${(c.dailySearchVolume ?? 0) > (myStore.dailySearchVolume ?? 0) ? "text-red-500 font-medium" : ""}`}>
                      {c.dailySearchVolume?.toLocaleString() ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 경쟁 매장 목록 */}
      {isLoading ? <Skeleton className="h-48 w-full rounded-xl" /> : comps.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">등록된 경쟁 매장이 없습니다. 위에서 추가하거나 매장 셋업을 실행하세요.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {comps.map((c: any, i: number) => (
            <Card key={c.id || i}>
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">{i + 1}</span>
                  <div>
                    <p className="font-medium text-sm">{c.competitorName}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      {c.blogReviewCount != null && <span>블로그 {c.blogReviewCount}건</span>}
                      {c.receiptReviewCount != null && <span>방문자 {c.receiptReviewCount}건</span>}
                      {c.dailySearchVolume != null && <span>검색 {c.dailySearchVolume}/일</span>}
                      {!c.blogReviewCount && !c.receiptReviewCount && <span className="text-yellow-500">"데이터 수집" 버튼을 눌러주세요</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.type === "AUTO" ? "secondary" : "outline"} className="text-[10px]">{c.type === "AUTO" ? "AI추천" : "직접추가"}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => deleteComp.mutate(c.id, {
                    onSuccess: () => toast.success("삭제됨"),
                    onError: () => toast.error("삭제 실패"),
                  })} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

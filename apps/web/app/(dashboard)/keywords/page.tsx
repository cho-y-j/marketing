"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useRankCheck } from "@/hooks/useRankHistory";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { BlogAnalysisCard } from "@/components/keywords/blog-analysis-card";
import { ConsultationCTA } from "@/components/common/consultation-cta";
import {
  Plus, Search, Loader2, Crown, ChevronRight,
  MessageSquare, FileText, Sparkles, RefreshCw, X, Trash2,
  ArrowUp, ArrowDown, Minus,
} from "lucide-react";

export default function KeywordsPage() {
  const { storeId } = useCurrentStoreId();
  const qc = useQueryClient();
  const rankCheck = useRankCheck(storeId);
  const [newKeyword, setNewKeyword] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [adding, setAdding] = useState(false);

  const { data: keywords, isLoading, refetch } = useQuery({
    queryKey: ["keywords-with-competition", storeId],
    queryFn: () =>
      apiClient.get(`/stores/${storeId}/keywords/with-competition`).then((r) => r.data),
    enabled: !!storeId,
  });

  // 검색량 미리보기 (먼저 조회)
  const handlePreview = async () => {
    if (!newKeyword.trim() || !storeId) return;
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const { data } = await apiClient.get(`/stores/${storeId}/keywords/preview-volume`, {
        params: { keyword: newKeyword.trim() },
      });
      setPreviewData(data);
    } catch (e: any) {
      toast.error("검색량 조회 실패");
    } finally {
      setPreviewLoading(false);
    }
  };

  // 미리보기 후 최종 추가
  const confirmAdd = async () => {
    if (!previewData) return;
    setAdding(true);
    try {
      await apiClient.post(`/stores/${storeId}/keywords`, {
        keyword: newKeyword.trim(),
        type: "USER_ADDED",
      });
      toast.success(`"${newKeyword.trim()}" 추가됨`);
      setNewKeyword("");
      setPreviewData(null);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "추가 실패");
    } finally {
      setAdding(false);
    }
  };

  const cancelPreview = () => {
    setPreviewData(null);
    setNewKeyword("");
  };

  const handleRankCheck = () => {
    rankCheck.mutate(undefined, {
      onSuccess: () => {
        toast.success("순위 체크 완료");
        qc.invalidateQueries({ queryKey: ["keywords-with-competition", storeId] });
      },
      onError: (e: any) =>
        toast.error("순위 체크 실패: " + (e.response?.data?.message || e.message)),
    });
  };

  const [sortBy, setSortBy] = useState<"volume" | "rank" | "name">("volume");
  const kwsRaw = keywords ?? [];
  const kws = [...kwsRaw].sort((a: any, b: any) => {
    if (sortBy === "rank") {
      const ar = a.currentRank ?? 9999;
      const br = b.currentRank ?? 9999;
      return ar - br;
    }
    if (sortBy === "name") return (a.keyword ?? "").localeCompare(b.keyword ?? "");
    return (b.monthlySearchVolume ?? 0) - (a.monthlySearchVolume ?? 0);
  });

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">키워드 분석</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kws.length}개 키워드 · 검색 키워드별 내 순위와 상위 매장 비교
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleRankCheck}
          disabled={rankCheck.isPending || kws.length === 0}
        >
          {rankCheck.isPending ? (
            <Loader2 size={14} className="animate-spin mr-1" />
          ) : (
            <RefreshCw size={14} className="mr-1" />
          )}
          전체 순위 체크
        </Button>
      </div>

      {/* 키워드 추가 — 검색량 미리보기 후 추가 */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="추적할 키워드 입력 → 조회 → 추가"
              value={newKeyword}
              onChange={(e) => {
                setNewKeyword(e.target.value);
                if (previewData) setPreviewData(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handlePreview()}
              className="pl-10"
              disabled={previewLoading || adding}
            />
          </div>
          <Button onClick={handlePreview} disabled={previewLoading || !newKeyword.trim() || !!previewData}>
            {previewLoading ? <Loader2 size={14} className="animate-spin mr-1" /> : <Search size={14} className="mr-1" />}
            검색량 조회
          </Button>
        </div>

        {/* 미리보기 카드 */}
        {previewData && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-bold text-sm mb-0.5">"{previewData.keyword}"</div>
                  <div className="text-xs text-muted-foreground">
                    경쟁 강도: <span className="font-semibold">{previewData.competition || "정보 없음"}</span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={cancelPreview} className="h-7 w-7 p-0">
                  <X size={14} />
                </Button>
              </div>

              {previewData.available ? (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center bg-white rounded p-2 border">
                      <div className="text-[10px] text-muted-foreground mb-0.5">월 검색량</div>
                      <div className="text-lg font-black">{previewData.monthly.toLocaleString()}</div>
                    </div>
                    <div className="text-center bg-white rounded p-2 border">
                      <div className="text-[10px] text-muted-foreground mb-0.5">주 검색량</div>
                      <div className="text-lg font-bold">{previewData.weekly.toLocaleString()}</div>
                    </div>
                    <div className="text-center bg-white rounded p-2 border">
                      <div className="text-[10px] text-muted-foreground mb-0.5">일 검색량</div>
                      <div className="text-lg font-bold">{previewData.daily.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex gap-3 text-[11px] text-muted-foreground mb-3">
                    <span>PC {previewData.pc?.toLocaleString() ?? 0}</span>
                    <span>모바일 {previewData.mobile?.toLocaleString() ?? 0}</span>
                  </div>
                  <Button onClick={confirmAdd} disabled={adding} className="w-full" size="sm">
                    {adding ? (
                      <><Loader2 size={14} className="animate-spin mr-1" /> 추가 중...</>
                    ) : (
                      <><Plus size={14} className="mr-1" /> "{previewData.keyword}" 추가하기</>
                    )}
                  </Button>
                </>
              ) : (
                <div className="text-center py-3">
                  <p className="text-sm text-muted-foreground mb-2">
                    이 키워드는 검색량이 거의 없습니다 (월 0회)
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    실제 사용자가 검색하지 않는 키워드일 수 있습니다.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={confirmAdd} disabled={adding} variant="outline" size="sm" className="flex-1">
                      그래도 추가하기
                    </Button>
                    <Button onClick={cancelPreview} variant="ghost" size="sm" className="flex-1">
                      취소
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 정렬 토글 */}
      {kws.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground mr-1">정렬:</span>
          {[
            { key: "volume", label: "검색량 순" },
            { key: "rank", label: "순위 순" },
            { key: "name", label: "이름 순" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key as any)}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                sortBy === opt.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white hover:bg-muted/50 border-border"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* 키워드 카드 목록 */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : kws.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Search size={32} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-semibold">추적 중인 키워드가 없습니다</p>
            <p className="text-xs text-muted-foreground mt-1">위에서 키워드를 추가해보세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {kws.map((kw: any) => (
            <KeywordCard key={kw.id} kw={kw} storeId={storeId} onChange={refetch} />
          ))}
        </div>
      )}

      {/* 블로그 상위노출 분석 (하단으로 이동) */}
      {storeId && kws.length > 0 && <BlogAnalysisCard storeId={storeId} />}

      {/* 전문 상담 CTA */}
      {storeId && kws.length > 0 && (
        <ConsultationCTA
          type="KEYWORD"
          storeId={storeId}
          title="키워드 전략, 전문가와 함께 세워보세요"
          description="상위 진입 가능 키워드 선별 + 블로그 발행 로드맵을 제안해드립니다."
        />
      )}
    </div>
  );
}

function KeywordCard({ kw, storeId, onChange }: { kw: any; storeId?: string; onChange: () => void }) {
  const top3 = kw.top3 || [];
  const myPlace = kw.myPlace;
  const myRank = kw.currentRank ?? myPlace?.rank;
  const myInTop3 = top3.some((p: any) => p.isMine);
  const [excluding, setExcluding] = useState(false);

  const handleExclude = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!storeId) return;
    if (!confirm(`"${kw.keyword}" 키워드를 제외할까요?\n삭제 후 AI 재생성 시에도 다시 나오지 않습니다.`)) return;
    setExcluding(true);
    try {
      await apiClient.delete(`/stores/${storeId}/keywords/${kw.id}`, {
        data: { reason: "사용자 판단" },
      });
      toast.success(`"${kw.keyword}" 제외됨`);
      onChange();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "제외 실패");
    } finally {
      setExcluding(false);
    }
  };

  // 순위 색상
  const rankColor =
    myRank == null ? "text-muted-foreground" :
    myRank <= 3 ? "text-brand" :
    myRank <= 10 ? "text-foreground" :
    "text-red-500";

  return (
    <Link href={`/keywords/${encodeURIComponent(kw.keyword)}`} className="block group">
      <Card className="group-hover:shadow-md group-hover:border-primary/30 transition-all">
        <CardContent className="p-4">
          {/* 헤더 */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base">{kw.keyword}</h3>
                {kw.type === "MAIN" && (
                  <Badge variant="outline" className="text-[10px] py-0">핵심</Badge>
                )}
                {kw.type === "HIDDEN" && (
                  <Badge variant="secondary" className="text-[10px] py-0 bg-amber-100 text-amber-700">히든</Badge>
                )}
                <button
                  type="button"
                  onClick={handleExclude}
                  disabled={excluding}
                  className="ml-1 p-2 -m-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50 inline-flex items-center justify-center min-w-[36px] min-h-[36px]"
                  title="이 키워드 제외"
                >
                  {excluding ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {kw.monthlyVolume > 0 || kw.dailyVolume > 0 || kw.weeklyVolume > 0 ? (
                  <>
                    월 <strong className="text-foreground">{kw.monthlyVolume.toLocaleString()}</strong> ·
                    주 {kw.weeklyVolume.toLocaleString()} ·
                    일 {kw.dailyVolume.toLocaleString()}
                    {kw.volumeEstimated && (
                      <span className="ml-1 text-[10px] text-muted-foreground/70">· 추정</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground/70">검색량 집계 중…</span>
                )}
                {kw.totalResults != null && ` · ${kw.totalResults}개 매장 노출`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-2xl font-black ${rankColor}`}>
                {myRank ? `${myRank}위` : <span className="text-base">100위 밖</span>}
              </div>
              {/* 순위 변동 (어제 대비) */}
              {kw.rankChange != null && (
                <div className="text-[11px] font-semibold mt-0.5">
                  {kw.rankChange > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-green-600">
                      <ArrowUp size={10} /> {kw.rankChange}
                    </span>
                  ) : kw.rankChange < 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-red-600">
                      <ArrowDown size={10} /> {Math.abs(kw.rankChange)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-muted-foreground">
                      <Minus size={10} />
                    </span>
                  )}
                </div>
              )}
              <ChevronRight size={14} className="ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>

          {/* Top 3 + 내 매장 미니 테이블 */}
          {top3.length > 0 ? (
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              {top3.map((p: any, i: number) => (
                <PlaceRow key={i} place={p} />
              ))}
              {/* 내 매장이 Top 3 밖이면 별도 추가 */}
              {myPlace && !myInTop3 && (
                <>
                  <div className="border-t border-border/50 my-1" />
                  <PlaceRow place={myPlace} />
                </>
              )}
            </div>
          ) : (
            <div className="bg-muted/20 rounded-lg p-3 text-center text-xs text-muted-foreground">
              순위 데이터 없음 — 상단 "전체 순위 체크" 버튼을 눌러주세요
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function PlaceRow({ place }: { place: any }) {
  const isEst = place.deltaSource === "estimate" || place.deltaSource === "backfill";
  const fmtDelta = (d: number | null | undefined) => {
    if (d == null) return null;
    const prefix = isEst ? "~" : "";
    if (d === 0) return <span className="text-[10px] text-muted-foreground">{prefix}±0</span>;
    if (d > 0) return <span className="text-[10px] text-green-600 font-semibold">{prefix}+{d}</span>;
    return <span className="text-[10px] text-red-600 font-semibold">{prefix}{d}</span>;
  };
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded ${place.isMine ? "bg-primary/15 ring-1 ring-primary/30" : ""}`}>
      {/* 순위 */}
      <div className="w-8 text-center shrink-0">
        {place.rank === 1 ? (
          <Crown size={14} className="text-yellow-500 mx-auto" />
        ) : (
          <span className={`text-sm font-bold ${
            place.rank <= 3 ? "text-brand" :
            place.rank <= 10 ? "text-foreground" : "text-muted-foreground"
          }`}>{place.rank}</span>
        )}
      </div>
      {/* 매장명 */}
      <div className="flex-1 min-w-0">
        <span className={`text-sm truncate ${place.isMine ? "font-bold" : "font-medium"}`}>
          {place.name}
        </span>
        {place.isMine && <Badge className="ml-1 text-[9px] py-0 px-1.5">나</Badge>}
      </div>
      {/* 지표 + 증감 */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        <span className="inline-flex flex-col items-end gap-0">
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare size={10} />
            {place.visitorReviewCount?.toLocaleString() ?? "-"}
          </span>
          {fmtDelta(place.visitorDelta)}
        </span>
        <span className="inline-flex flex-col items-end gap-0">
          <span className="inline-flex items-center gap-0.5">
            <FileText size={10} />
            {place.blogReviewCount?.toLocaleString() ?? "-"}
          </span>
          {fmtDelta(place.blogDelta)}
        </span>
      </div>
    </div>
  );
}

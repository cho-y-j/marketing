"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  ArrowUp, ArrowDown, Minus, Wand2,
} from "lucide-react";

export default function KeywordsPage() {
  const { storeId } = useCurrentStoreId();
  const qc = useQueryClient();
  const rankCheck = useRankCheck(storeId);
  const [newKeyword, setNewKeyword] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  // 변동 표시 기간 — 1일/7일/30일 + 임의 날짜 (사장님 룰: 한 번에 하나만 표기)
  const [period, setPeriod] = useState<"1d" | "7d" | "30d" | "date">("1d");
  const [customDate, setCustomDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<"volume" | "rank" | "name">("volume");

  // compareDate 가 활성화된 경우(period=date + 유효한 날짜) 백엔드에 파라미터 전달
  const activeCompareDate = period === "date" && customDate ? customDate : undefined;
  const { data: keywords, isLoading, refetch } = useQuery({
    queryKey: ["keywords-with-competition", storeId, activeCompareDate],
    queryFn: () =>
      apiClient
        .get(`/stores/${storeId}/keywords/with-competition`, {
          params: activeCompareDate ? { compareDate: activeCompareDate } : undefined,
        })
        .then((r) => r.data),
    enabled: !!storeId,
  });

  // 키워드별 어제/오늘/델타 검색량 — `/keywords/flow` (KeywordDailyVolume)
  const { data: searchFlow } = useQuery<Record<string, { today: number | null; yesterday: number | null; delta: number | null }>>({
    queryKey: ["keywords-flow", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/keywords/flow`).then((r) => r.data),
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
      onSuccess: (data: any) => {
        const results = data?.results ?? [];
        const ok = results.filter((r: any) => r.currentRank != null).length;
        const total = results.length;
        if (total === 0) {
          toast.warning("추적 키워드가 없습니다");
        } else if (ok === 0) {
          toast.error(`순위 체크 — ${total}개 모두 신뢰 불가 (네이버 차단 또는 좌표 누락)`);
        } else if (ok < total) {
          toast.warning(`${ok}/${total}개 갱신 — ${total - ok}개는 신뢰도 부족으로 이전 값 유지`);
        } else {
          toast.success(`${total}개 키워드 순위 갱신 완료`);
        }
        qc.invalidateQueries({ queryKey: ["keywords-with-competition", storeId] });
      },
      onError: (e: any) =>
        toast.error("순위 체크 실패: " + (e.response?.data?.message || e.message)),
    });
  };

  // 키워드 lastCheckedAt 중 최신값 = "마지막 순위 체크" 시각
  const lastRankCheckedAt = useMemo(() => {
    const ts = (keywords ?? [])
      .map((k: any) => k.lastCheckedAt)
      .filter(Boolean)
      .map((d: any) => new Date(d).getTime());
    return ts.length ? new Date(Math.max(...ts)) : null;
  }, [keywords]);

  // "방금 전 / N분 전 / 오늘 14:35 / 04-29 14:35" 상대 표기
  const formatLastChecked = (d: Date | null): string => {
    if (!d) return "체크 기록 없음";
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (diffMin < 1) return "방금 전";
    if (diffMin < 60) return `${diffMin}분 전`;
    const today = new Date();
    const isToday =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (isToday) return `오늘 ${hh}:${mm}`;
    const M = String(d.getMonth() + 1).padStart(2, "0");
    const D = String(d.getDate()).padStart(2, "0");
    return `${M}-${D} ${hh}:${mm}`;
  };

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
            <span className="mx-1.5 opacity-50">·</span>
            <span>마지막 체크: {formatLastChecked(lastRankCheckedAt)}</span>
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
                  <div className="flex gap-2">
                    <Button onClick={confirmAdd} disabled={adding} className="flex-1" size="sm">
                      {adding ? (
                        <><Loader2 size={14} className="animate-spin mr-1" /> 추가 중...</>
                      ) : (
                        <><Plus size={14} className="mr-1" /> 추가하기</>
                      )}
                    </Button>
                    <Link
                      href={`/content?type=PLACE_POST&keyword=${encodeURIComponent(previewData.keyword)}`}
                      title="이 키워드로 AI 콘텐츠 즉시 생성"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Wand2 size={14} className="mr-1" /> AI 글 작성
                    </Link>
                  </div>
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

      {/* 변동 기간 + 정렬 토글 */}
      {kws.length > 0 && (
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-muted-foreground mr-1">변동:</span>
            {[
              { key: "1d", label: "1일" },
              { key: "7d", label: "7일" },
              { key: "30d", label: "30일" },
              { key: "date", label: "날짜선택" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPeriod(opt.key as "1d" | "7d" | "30d" | "date")}
                className={`px-3 min-h-[36px] rounded-md border transition-colors ${
                  period === opt.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white hover:bg-muted/50 border-border"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {period === "date" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="px-2 min-h-[36px] rounded-md border border-border bg-white text-xs"
              />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground mr-1">정렬:</span>
            {[
              { key: "volume", label: "검색량 순" },
              { key: "rank", label: "순위 순" },
              { key: "name", label: "이름 순" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key as any)}
                className={`px-3 min-h-[36px] rounded-md border transition-colors ${
                  sortBy === opt.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white hover:bg-muted/50 border-border"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            <KeywordCard
              key={kw.id}
              kw={kw}
              storeId={storeId}
              onChange={refetch}
              period={period}
              customDate={customDate}
              searchFlow={searchFlow?.[kw.keyword]}
            />
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

function KeywordCard({
  kw, storeId, onChange, period, customDate, searchFlow,
}: {
  kw: any;
  storeId?: string;
  onChange: () => void;
  period: "1d" | "7d" | "30d" | "date";
  customDate?: string;
  searchFlow?: { today: number | null; yesterday: number | null; delta: number | null };
}) {
  const router = useRouter();
  const goWrite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/content?type=PLACE_POST&keyword=${encodeURIComponent(kw.keyword)}`);
  };
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
                {/* 이 키워드로 AI 글 작성 — /content 딥링크 (사장님 룰: 키워드는 실행 입력값) */}
                <button
                  type="button"
                  onClick={goWrite}
                  className="ml-auto inline-flex items-center gap-1 px-2 min-h-[36px] rounded-md text-[11px] font-medium text-brand bg-brand-subtle/40 hover:bg-brand-subtle transition-colors"
                  title="이 키워드로 AI 콘텐츠 생성"
                >
                  <Wand2 size={11} /> AI 글
                </button>
                <button
                  type="button"
                  onClick={handleExclude}
                  disabled={excluding}
                  className="p-2 -m-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50 inline-flex items-center justify-center min-w-[36px] min-h-[36px]"
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
                  </>
                ) : (
                  <span className="text-muted-foreground/70">검색량 집계 중…</span>
                )}
                {kw.totalResults != null && ` · ${kw.totalResults}개 매장 노출`}
              </p>
              {/* 일 단위 검색량 어제 vs 오늘 (KeywordDailyVolume) — 사장님 룰: 매출 변동 원인 추적용 */}
              {searchFlow && searchFlow.today != null && (
                <p className="text-[11px] mt-0.5 inline-flex items-center gap-1.5">
                  <span className="text-muted-foreground">검색</span>
                  {searchFlow.yesterday != null && (
                    <span className="text-muted-foreground">
                      어제 {searchFlow.yesterday.toLocaleString()}
                    </span>
                  )}
                  <span className="text-foreground font-semibold">
                    오늘 {searchFlow.today.toLocaleString()}
                  </span>
                  {searchFlow.delta != null && searchFlow.delta !== 0 && (
                    <span className={`font-bold ${searchFlow.delta > 0 ? "text-red-600" : "text-blue-600"}`}>
                      {searchFlow.delta > 0 ? "▲" : "▼"} {searchFlow.delta > 0 ? "+" : ""}{searchFlow.delta.toLocaleString()}
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className={`text-2xl font-black ${rankColor}`}>
                {myRank ? (
                  `${myRank}위`
                ) : kw.totalResults != null && kw.totalResults <= 10 ? (
                  <span className="text-base text-muted-foreground" title={`검색결과 ${kw.totalResults}개 중 내 매장 미포함`}>
                    미노출
                  </span>
                ) : (
                  <span className="text-base">70위 밖</span>
                )}
              </div>
              {/* totalResults 적은 키워드는 부가 설명 표시 */}
              {!myRank && kw.totalResults != null && kw.totalResults <= 10 && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  결과 {kw.totalResults}개
                </div>
              )}
              {/* 순위 변동 — 토글된 기간 한 가지만 표기. 좋아짐 = 파랑, 나빠짐 = 빨강 */}
              <div className="mt-1">
                <RankDelta
                  label={
                    period === "1d" ? "1일"
                    : period === "7d" ? "7일"
                    : period === "30d" ? "30일"
                    : customDate ? customDate.slice(5) : "날짜"
                  }
                  change={
                    period === "1d" ? kw.rankChange :
                    period === "7d" ? kw.rankChange7d :
                    period === "30d" ? kw.rankChange30d :
                    kw.rankChangeCustom
                  }
                  hasCurrentRank={kw.currentRank != null || kw.myPlace?.rank != null}
                />
              </div>
              <ChevronRight size={14} className="ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>

          {/* Top 3 + 내 매장 미니 테이블 */}
          {top3.length > 0 ? (
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              {top3.map((p: any, i: number) => (
                <PlaceRow key={i} place={p} period={period} />
              ))}
              {/* 내 매장이 Top 3 밖이면 별도 추가 */}
              {myPlace && !myInTop3 && (
                <>
                  <div className="border-t border-border/50 my-1" />
                  <PlaceRow place={myPlace} period={period} />
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

// 순위 변동 표시 — change > 0 = 순위 상승(좋음, 파랑), < 0 = 하락(나쁨, 빨강).
// 사장님 룰 (2026-04-30): "이걸 보기 위한 화면" — 변동을 명확히 보이게.
//  - change=null + 현재순위 있음 → "비교없음" 회색 칩 (이전 측정 부재 안내)
//  - change=null + 현재순위 null → 표시 안 함 (70위 밖 등)
//  - change=0 → "변동없음" 회색 칩 (의도된 0 임을 명시)
//  - change>0 → "▲ N" 파랑 (상승)
//  - change<0 → "▼ N" 빨강 (하락)
function RankDelta({
  label,
  change,
  hasCurrentRank,
}: {
  label: string;
  change: number | null | undefined;
  hasCurrentRank?: boolean;
}) {
  if (change == null) {
    if (!hasCurrentRank) return null;
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground bg-muted">
        <span className="font-normal">{label}</span>
        <span>비교없음</span>
      </span>
    );
  }
  if (change === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground bg-muted">
        <span className="font-normal">{label}</span>
        <Minus size={10} />
        <span>변동없음</span>
      </span>
    );
  }
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200">
        <span className="text-[10px] font-normal text-blue-600/80">{label}</span>
        <ArrowUp size={12} /> {change}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold text-red-700 bg-red-50 border border-red-200">
      <span className="text-[10px] font-normal text-red-600/80">{label}</span>
      <ArrowDown size={12} /> {Math.abs(change)}
    </span>
  );
}

function PlaceRow({ place, period }: { place: any; period: "1d" | "7d" | "30d" | "date" }) {
  // visitor/blog 변동은 1d/7d/30d 단위만 백엔드에서 계산. "date" 모드는 일단 1d 데이터 사용
  // (Top3 매장의 임의 날짜 비교는 P3 — CompetitorDailySnapshot 별도 조회 필요)
  const periodForDelta: "1d" | "7d" | "30d" = period === "date" ? "1d" : period;
  // 색 컨벤션 (사장님 룰): visitor/blog 증감은 부호로 통일 — + 빨강, - 파랑, ±0 회색.
  // 내 매장이라도 동일 (감소가 진짜 일어날 수 있음 = 리뷰 삭제 등).
  const fmtDelta = (d: number | null | undefined) => {
    if (d == null) return null;
    if (d === 0) return <span className="text-[10px] text-muted-foreground">±0</span>;
    const cls = d > 0 ? "text-red-600" : "text-blue-600";
    return (
      <span className={`text-[10px] font-semibold ${cls}`}>
        {d > 0 ? "+" : ""}{d}
      </span>
    );
  };
  const visitorDelta =
    periodForDelta === "1d" ? place.visitorDelta :
    periodForDelta === "7d" ? place.visitorDelta7d :
    place.visitorDelta30d;
  const blogDelta =
    periodForDelta === "1d" ? place.blogDelta :
    periodForDelta === "7d" ? place.blogDelta7d :
    place.blogDelta30d;
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
      {/* 지표 + 증감 — period 토글로 한 번에 한 가지만 (1일/7일) */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        <span className="inline-flex flex-col items-end gap-0 leading-tight">
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare size={10} />
            {place.visitorReviewCount?.toLocaleString() ?? "-"}
          </span>
          {fmtDelta(visitorDelta)}
        </span>
        <span className="inline-flex flex-col items-end gap-0 leading-tight">
          <span className="inline-flex items-center gap-0.5">
            <FileText size={10} />
            {place.blogReviewCount?.toLocaleString() ?? "-"}
          </span>
          {fmtDelta(blogDelta)}
        </span>
      </div>
    </div>
  );
}

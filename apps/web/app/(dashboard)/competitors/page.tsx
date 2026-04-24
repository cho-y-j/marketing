"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import {
  useCompetitors,
  useAddCompetitor,
  useDeleteCompetitor,
  useCompetitorComparison,
} from "@/hooks/useCompetitors";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Plus, Loader2, RefreshCw, Crown, Trash2, AlertTriangle,
  MessageSquare, FileText,
} from "lucide-react";
import { ConsultationCTA } from "@/components/common/consultation-cta";

type Period = "day" | "week" | "month" | "date";
const PERIOD_LABEL: Record<Period, string> = {
  day: "오늘",
  week: "7일",
  month: "30일",
  date: "날짜선택",
};
type Metric = "visitor" | "blog";
type SortKey = "cumulative" | "delta" | "rate";

// 증감률로 상태 판정 (이모지 없이, 색상과 텍스트로만 구분)
function getStatus(rate: number | null, delta: number | null) {
  if (rate == null || delta == null) return { label: "수집중", color: "bg-muted text-muted-foreground border-border" };
  if (rate >= 1.5) return { label: "급증", color: "bg-orange-100 text-orange-700 border-orange-300" };
  if (rate >= 0.5) return { label: "활발", color: "bg-green-100 text-green-700 border-green-300" };
  if (rate > 0) return { label: "평온", color: "bg-muted/60 text-foreground/70 border-border" };
  if (rate === 0) return { label: "정체", color: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "감소", color: "bg-red-100 text-red-700 border-red-300" };
}

type MetricData = {
  cumulative: number | null;
  delta: number | null;
  rate: number | null;
};
type Row = {
  key: string;
  name: string;
  isMine: boolean;
  placeId: string | null;
  competitorId?: string;
  visitor: MetricData;
  blog: MetricData;
};

type TabType = "EXPOSURE" | "DIRECT";

export default function CompetitorsPage() {
  const { storeId } = useCurrentStoreId();

  // 2026-04-24: 2-레이어 경쟁 탭 (상권 강자 / 같은 업종)
  const [tab, setTab] = useState<TabType>("EXPOSURE");

  const { data: competitors, refetch } = useCompetitors(storeId, tab);
  const { data: comparison, isLoading } = useCompetitorComparison(storeId, tab);
  const addComp = useAddCompetitor(storeId);
  const deleteComp = useDeleteCompetitor(storeId);

  // 전체 경쟁사 개수 (탭 배지용)
  const { data: allCompetitors } = useCompetitors(storeId);

  const [newName, setNewName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [sortMetric, setSortMetric] = useState<Metric>("visitor"); // 순위 기준
  const [sortKey, setSortKey] = useState<SortKey>("cumulative");
  const [customDate, setCustomDate] = useState<string>("");

  // 탭별 경쟁사 개수 계산 (전체에서 집계, BOTH 는 양쪽 카운트)
  const exposureCount = (allCompetitors ?? []).filter(
    (c: any) => c.competitionType === "EXPOSURE" || c.competitionType === "BOTH",
  ).length;
  const directCount = (allCompetitors ?? []).filter(
    (c: any) => c.competitionType === "DIRECT" || c.competitionType === "BOTH",
  ).length;

  const { data: dailyResp } = useQuery<{ competitors: any[]; summary: any }>({
    queryKey: ["competitors-daily", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/competitors/daily`).then((r) => r.data),
    enabled: !!storeId,
  });
  const { data: flow } = useQuery<any>({
    queryKey: ["store-flow", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/flow`).then((r) => r.data),
    enabled: !!storeId,
  });
  const { data: timelineResp } = useQuery<{
    competitors: Array<{ placeId: string; name: string; days: Array<any> }>;
  }>({
    queryKey: ["competitors-timeline", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/competitors/timeline`).then((r) => r.data),
    enabled: !!storeId,
  });

  const dailyByPid = new Map<string, any>();
  const dailyByName = new Map<string, any>();
  for (const d of dailyResp?.competitors ?? []) {
    if (d.placeId) dailyByPid.set(d.placeId, d);
    dailyByName.set(d.name, d);
  }
  const timelineByPid = new Map<string, Map<string, any>>();
  for (const c of timelineResp?.competitors ?? []) {
    if (!c.placeId) continue;
    const m = new Map<string, any>();
    for (const day of c.days) m.set(day.date, day);
    timelineByPid.set(c.placeId, m);
  }
  const myFlowTimeline: Array<any> = flow?.timeline ?? [];
  const myByDate = new Map<string, any>();
  for (const t of myFlowTimeline) {
    const k = typeof t.date === "string" ? t.date.slice(0, 10) : new Date(t.date as any).toISOString().slice(0, 10);
    myByDate.set(k, t);
  }
  const availableDates = Array.from(
    new Set((timelineResp?.competitors ?? []).flatMap((c) => c.days.map((d: any) => d.date)))
  ).sort((a, b) => (a < b ? 1 : -1));
  const effectiveDate = customDate || availableDates[0] || "";

  // === 한 지표의 데이터 계산 ===
  const calcMetric = (
    cumulative: number | null,
    delta: number | null,
  ): MetricData => {
    let rate: number | null = null;
    if (cumulative != null && delta != null) {
      const base = cumulative - delta;
      rate = base > 0 ? (delta / base) * 100 : null;
    }
    return { cumulative, delta, rate };
  };

  const makeCompetitorRow = (c: any): Row => {
    const d = (c.placeId && dailyByPid.get(c.placeId)) || dailyByName.get(c.name) || null;
    const vCum = d?.visitorTotal ?? c.receiptReviewCount ?? null;
    const bCum = d?.blogTotal ?? c.blogReviewCount ?? null;

    let vDelta: number | null = null;
    let bDelta: number | null = null;
    if (period === "date") {
      const snap = c.placeId ? timelineByPid.get(c.placeId)?.get(effectiveDate) : null;
      vDelta = snap?.visitorDelta ?? null;
      bDelta = snap?.blogDelta ?? null;
    } else {
      vDelta = d?.deltas?.visitor?.[period] ?? null;
      bDelta = d?.deltas?.blog?.[period] ?? null;
    }

    return {
      key: `comp_${c.id ?? c.placeId ?? c.name}`,
      name: c.name,
      isMine: false,
      placeId: c.placeId ?? null,
      competitorId: c.id,
      visitor: calcMetric(vCum, vDelta),
      blog: calcMetric(bCum, bDelta),
    };
  };

  const makeMyRow = (): Row => {
    const vCum = flow?.visitor?.current ?? null;
    const bCum = flow?.blog?.current ?? null;
    let vDelta: number | null = null;
    let bDelta: number | null = null;
    if (period === "date") {
      const snap = myByDate.get(effectiveDate);
      vDelta = snap?.visitorDelta ?? null;
      bDelta = snap?.blogDelta ?? null;
    } else {
      const key = period === "day" ? "deltaDay" : period === "week" ? "deltaWeek" : "deltaMonth";
      vDelta = flow?.visitor?.[key] ?? null;
      bDelta = flow?.blog?.[key] ?? null;
    }
    return {
      key: "me",
      name: flow?.storeName || "내 매장",
      isMine: true,
      placeId: null,
      visitor: calcMetric(vCum, vDelta),
      blog: calcMetric(bCum, bDelta),
    };
  };

  const allRows: Row[] = useMemo(() => {
    const compRows = (comparison?.competitors ?? []).map(makeCompetitorRow);
    return [makeMyRow(), ...compRows];
  }, [comparison, dailyResp, flow, timelineResp, period, effectiveDate]);

  // 정렬 (sortMetric 기준)
  const sortedRows = useMemo(() => {
    const arr = [...allRows];
    arr.sort((a, b) => {
      const am = sortMetric === "visitor" ? a.visitor : a.blog;
      const bm = sortMetric === "visitor" ? b.visitor : b.blog;
      const va = (sortKey === "cumulative" ? am.cumulative : sortKey === "delta" ? am.delta : am.rate) ?? -Infinity;
      const vb = (sortKey === "cumulative" ? bm.cumulative : sortKey === "delta" ? bm.delta : bm.rate) ?? -Infinity;
      return vb - va;
    });
    return arr;
  }, [allRows, sortKey, sortMetric]);

  const myRow = sortedRows.find((r) => r.isMine);
  const myRank = myRow ? sortedRows.indexOf(myRow) + 1 : null;
  const totalRows = sortedRows.length;

  // 진단: 순위 기준 지표로 계산
  const keyMetric = (r: Row) => (sortMetric === "visitor" ? r.visitor : r.blog);
  const topGrowth = [...allRows]
    .filter((r) => !r.isMine && keyMetric(r).rate != null)
    .sort((a, b) => (keyMetric(b).rate ?? -Infinity) - (keyMetric(a).rate ?? -Infinity))[0];
  const topCumulative = [...allRows]
    .filter((r) => !r.isMine && keyMetric(r).cumulative != null)
    .sort((a, b) => (keyMetric(b).cumulative ?? -Infinity) - (keyMetric(a).cumulative ?? -Infinity))[0];
  const competitorRates = allRows.filter((r) => !r.isMine && keyMetric(r).rate != null).map((r) => keyMetric(r).rate!);
  const avgCompetitorRate = competitorRates.length > 0
    ? competitorRates.reduce((s, n) => s + n, 0) / competitorRates.length
    : null;

  const handleAdd = () => {
    const name = newName.trim();
    if (name.length < 2) return toast.error("2글자 이상 입력");
    if (competitors?.some((c: any) => c.competitorName === name)) return toast.error("이미 등록됨");
    addComp.mutate({ competitorName: name }, {
      onSuccess: () => {
        toast.success(`"${name}" 추가 — 데이터 수집 중...`);
        setNewName("");
        setTimeout(() => refetch(), 5000);
      },
      onError: (e: any) => toast.error(e.response?.data?.message || "추가 실패"),
    });
  };
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      toast.info("경쟁사 데이터 갱신 중...");
      await apiClient.post(`/stores/${storeId}/competitors/refresh`);
      toast.success("갱신 완료");
      refetch();
    } catch {
      toast.error("갱신 실패");
    } finally { setRefreshing(false); }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const periodLabel = period === "date" ? (effectiveDate || "날짜") : PERIOD_LABEL[period];
  const sortMetricLabel = sortMetric === "visitor" ? "방문자 리뷰" : "블로그 리뷰";

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* ===== 헤더 ===== */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">경쟁매장</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tab === "EXPOSURE"
              ? `대표 키워드 Top 매장 (업종 불문) · ${competitors?.length ?? 0}곳`
              : `같은 업종 직접 경쟁 · ${competitors?.length ?? 0}곳`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
          데이터 갱신
        </Button>
      </div>

      {/* ===== 2-레이어 탭 ===== */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg text-sm" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "EXPOSURE"}
          onClick={() => setTab("EXPOSURE")}
          className={`flex-1 px-3 py-2 rounded-md font-medium transition-colors min-h-[36px] ${
            tab === "EXPOSURE"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          상권 강자 <span className="text-xs opacity-70">({exposureCount})</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "DIRECT"}
          onClick={() => setTab("DIRECT")}
          className={`flex-1 px-3 py-2 rounded-md font-medium transition-colors min-h-[36px] ${
            tab === "DIRECT"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          같은 업종 <span className="text-xs opacity-70">({directCount})</span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground -mt-2 px-1">
        {tab === "EXPOSURE"
          ? "대표 키워드로 검색 시 노출되는 Top 매장 — 업종은 달라도 같은 상권 슬롯을 두고 경쟁"
          : "같은 메뉴/업종으로 직접 경쟁하는 매장 — 메뉴·객단가·전략 비교 대상"}
      </p>

      {/* ===== 진단 박스 ===== */}
      {myRank && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-1.5 text-sm">
            <div className="font-bold">
              내 매장 순위{" "}
              <span className="text-primary">{myRank}위 / {totalRows}</span>
              <span className="text-muted-foreground font-normal ml-2 text-xs">
                ({sortMetricLabel}, {periodLabel} 기준)
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              {topCumulative && (
                <div>
                  <span className="font-semibold text-foreground">추격 대상:</span>{" "}
                  <span className="font-semibold">{topCumulative.name}</span> — 누적{" "}
                  {keyMetric(topCumulative).cumulative?.toLocaleString()}
                  {" "}
                  <span className="text-muted-foreground/80">
                    (나보다 {((keyMetric(topCumulative).cumulative ?? 0) - (keyMetric(myRow!).cumulative ?? 0)).toLocaleString()} 앞섬)
                  </span>
                </div>
              )}
              {topGrowth && keyMetric(topGrowth).rate != null && keyMetric(topGrowth).rate! >= 0.5 && (
                <div>
                  <span className="font-semibold text-foreground">급성장 중:</span>{" "}
                  <span className="font-semibold">{topGrowth.name}</span> — {periodLabel} 증감률{" "}
                  <span className="text-orange-600 font-bold">+{keyMetric(topGrowth).rate!.toFixed(2)}%</span>
                </div>
              )}
              {keyMetric(myRow!).rate != null && avgCompetitorRate != null && (
                <div>
                  <span className="font-semibold text-foreground">내 속도:</span>{" "}
                  <span className={`font-bold ${keyMetric(myRow!).rate! > avgCompetitorRate ? "text-green-600" : "text-red-600"}`}>
                    {keyMetric(myRow!).rate! > 0 ? "+" : ""}{keyMetric(myRow!).rate!.toFixed(2)}%
                  </span>{" "}
                  vs 경쟁사 평균 {avgCompetitorRate > 0 ? "+" : ""}{avgCompetitorRate.toFixed(2)}%{" "}
                  <span className="text-muted-foreground">
                    ({keyMetric(myRow!).rate! > avgCompetitorRate ? "앞섬" : keyMetric(myRow!).rate! < avgCompetitorRate ? "뒤처짐" : "동등"})
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== 컨트롤 — 기간 버튼 + 정렬 드롭다운 1개 ===== */}
      <Card>
        <CardContent className="p-3 space-y-2.5">
          {/* 기간 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1 w-10">기간</span>
            {(["day", "week", "month", "date"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 min-h-[36px] text-sm rounded-md border transition-colors font-medium ${
                  period === p ? "bg-primary text-primary-foreground border-primary" : "bg-white hover:bg-muted/50 border-border"
                }`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
            {period === "date" && (
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={availableDates[availableDates.length - 1]}
                max={availableDates[0]}
                className="ml-2 px-2 min-h-[36px] text-sm border border-border rounded-md bg-white"
              />
            )}
          </div>
          {/* 정렬 — 콤보 2개 분리: 기준 + 정렬방식 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1 w-10">정렬</span>
            <select
              value={sortMetric}
              onChange={(e) => setSortMetric(e.target.value as Metric)}
              className="flex-1 min-w-[120px] min-h-[36px] px-3 text-sm rounded-md border border-border bg-white font-medium"
            >
              <option value="visitor">방문자 리뷰</option>
              <option value="blog">블로그 리뷰</option>
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="flex-1 min-w-[140px] min-h-[36px] px-3 text-sm rounded-md border border-border bg-white font-medium"
            >
              <option value="cumulative">누적 많은 순</option>
              <option value="delta">증가 많은 순</option>
              <option value="rate">증가율 높은 순</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ===== 모바일: 카드 리스트 ===== */}
      <div className="md:hidden space-y-2">
        {sortedRows.map((r, idx) => (
          <MobileRankCard
            key={r.key}
            rank={idx + 1}
            row={r}
            periodLabel={periodLabel}
            sortMetric={sortMetric}
            onDelete={r.isMine || !r.competitorId ? undefined : () => {
              if (!confirm(`"${r.name}" 삭제?`)) return;
              deleteComp.mutate(r.competitorId!, { onSuccess: () => toast.success("삭제됨") });
            }}
          />
        ))}
        {sortedRows.length <= 1 && (
          <Card>
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              <AlertTriangle size={16} className="mx-auto mb-2 text-amber-500" />
              등록된 경쟁사가 없습니다 — 아래서 추가하세요
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== 데스크탑: 테이블 ===== */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {/* 헤더 - 그룹 */}
              <div className="grid grid-cols-[36px_minmax(140px,220px)_repeat(3,78px)_repeat(3,78px)_32px] gap-2 px-3 py-1.5 border-b bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                <div></div>
                <div></div>
                <div className="col-span-3 text-center border-l border-r border-border/50 bg-muted/50">방문자 리뷰</div>
                <div className="col-span-3 text-center border-r border-border/50 bg-muted/50">블로그 리뷰</div>
                <div></div>
              </div>
              {/* 헤더 - 세부 */}
              <div className="grid grid-cols-[36px_minmax(140px,220px)_repeat(3,78px)_repeat(3,78px)_32px] gap-2 px-3 py-2 border-b bg-muted/30 text-[10px] font-semibold text-muted-foreground">
                <div className="text-center">#</div>
                <div>매장명</div>
                <div className="text-right border-l border-border/50">누적</div>
                <div className="text-right">{periodLabel}증감</div>
                <div className="text-right border-r border-border/50">증감률</div>
                <div className="text-right">누적</div>
                <div className="text-right">{periodLabel}증감</div>
                <div className="text-right border-r border-border/50">증감률</div>
                <div></div>
              </div>
              {/* Rows */}
              {sortedRows.map((r, idx) => (
                <RankRow
                  key={r.key}
                  rank={idx + 1}
                  row={r}
                  onDelete={r.isMine || !r.competitorId ? undefined : () => {
                    if (!confirm(`"${r.name}" 삭제?`)) return;
                    deleteComp.mutate(r.competitorId!, { onSuccess: () => toast.success("삭제됨") });
                  }}
                />
              ))}
              {sortedRows.length <= 1 && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <AlertTriangle size={16} className="mx-auto mb-2 text-amber-500" />
                  등록된 경쟁사가 없습니다 — 아래서 추가하세요
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== 범례 ===== */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground px-1">
        <span>증감률 기준:</span>
        <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">급증 ≥1.5%</Badge>
        <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">활발 0.5~1.5%</Badge>
        <Badge variant="outline" className="bg-muted/60 text-foreground/70 border-border">평온 0~0.5%</Badge>
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">정체 0%</Badge>
        <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">감소 &lt;0%</Badge>
      </div>

      {/* ===== 경쟁사 추가 ===== */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Plus size={14} className="text-primary" />
            <span className="font-semibold text-sm">경쟁사 추가</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            매장명 입력 → 네이버 자동 검색 → 과거 30일 추이 자동 수집
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="경쟁 매장명"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={addComp.isPending || !newName.trim()}>
              {addComp.isPending ? <Loader2 size={14} className="animate-spin" /> : "추가"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {storeId && sortedRows.length > 1 && (
        <ConsultationCTA
          type="GENERAL"
          storeId={storeId}
          title="경쟁사 격차 좁히기, 어디서부터?"
          description="발행 속도·리뷰·콘텐츠 우선순위를 전문가가 진단해드립니다."
        />
      )}
    </div>
  );
}

// 모바일 카드 — 방문자/블로그 한 줄 압축 (키워드 상세 페이지 톤 통일)
function MobileRankCard({
  rank, row, periodLabel, sortMetric, onDelete,
}: {
  rank: number;
  row: Row;
  periodLabel: string;
  sortMetric: Metric;
  onDelete?: () => void;
}) {
  const fmtDelta = (v: number | null) =>
    v == null ? "-" : v === 0 ? "±0" : v > 0 ? `+${v.toLocaleString()}` : `${v.toLocaleString()}`;
  const fmtRate = (v: number | null) =>
    v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  const clr = (v: number | null) =>
    v == null ? "text-muted-foreground" : v > 0 ? "text-red-600" : v < 0 ? "text-green-600" : "text-muted-foreground";

  const primaryStatus = getStatus(
    sortMetric === "visitor" ? row.visitor.rate : row.blog.rate,
    sortMetric === "visitor" ? row.visitor.delta : row.blog.delta,
  );

  return (
    <Card className={row.isMine ? "bg-primary/10 border-l-2 border-l-primary" : ""}>
      <CardContent className="p-3">
        {/* 헤더 — 순위 + 이름 + 급증/삭제 */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {rank === 1 && <Crown size={14} className="text-amber-500 shrink-0" />}
            <span className={`text-sm font-bold shrink-0 ${row.isMine ? "text-primary" : "text-muted-foreground"}`}>
              {rank}
            </span>
            <span className={`text-sm font-semibold truncate ${row.isMine ? "text-primary" : ""}`}>
              {row.name}
            </span>
            {row.isMine && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-bold shrink-0">
                나
              </span>
            )}
            {primaryStatus.label === "급증" && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${primaryStatus.color}`}>
                급증
              </Badge>
            )}
          </div>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 p-2 -m-2 inline-flex items-center justify-center min-w-[36px] min-h-[36px]"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* 한 줄 지표 — 방문자/블로그 아이콘 + 값 + 증감 + 증감률 */}
        <div className="flex items-center gap-4 pl-6 text-sm">
          <MetricInline
            icon={MessageSquare}
            data={row.visitor}
            highlight={sortMetric === "visitor"}
            fmtDelta={fmtDelta}
            fmtRate={fmtRate}
            clr={clr}
          />
          <MetricInline
            icon={FileText}
            data={row.blog}
            highlight={sortMetric === "blog"}
            fmtDelta={fmtDelta}
            fmtRate={fmtRate}
            clr={clr}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// 방문자/블로그 한 줄 미니 — 아이콘 + 값 + 증감 + 증감률
function MetricInline({
  icon: Icon, data, highlight, fmtDelta, fmtRate, clr,
}: {
  icon: any;
  data: Row["visitor"];
  highlight: boolean;
  fmtDelta: (v: number | null) => string;
  fmtRate: (v: number | null) => string;
  clr: (v: number | null) => string;
}) {
  return (
    <span className={`inline-flex items-baseline gap-1 min-w-0 ${highlight ? "font-bold" : ""}`}>
      <Icon size={12} className={`shrink-0 self-center ${highlight ? "text-foreground" : "text-muted-foreground"}`} />
      <span className="font-mono tabular-nums">
        {data.cumulative != null ? data.cumulative.toLocaleString() : "-"}
      </span>
      <span className={`font-mono tabular-nums text-[12px] ${clr(data.delta)}`}>
        {fmtDelta(data.delta)}
      </span>
      <span className={`font-mono tabular-nums text-[11px] ${clr(data.rate)}`}>
        ({fmtRate(data.rate)})
      </span>
    </span>
  );
}

function RankRow({
  rank, row, onDelete,
}: {
  rank: number;
  row: Row;
  onDelete?: () => void;
}) {
  const fmtDelta = (v: number | null) => {
    if (v == null) return "-";
    if (v === 0) return "0";
    return v > 0 ? `+${v.toLocaleString()}` : `${v.toLocaleString()}`;
  };
  const fmtRate = (v: number | null) => {
    if (v == null) return "-";
    return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  };
  const clr = (v: number | null) =>
    v == null ? "text-muted-foreground" :
    v > 0 ? "text-green-600" :
    v < 0 ? "text-red-600" :
    "text-muted-foreground";

  const vStatus = getStatus(row.visitor.rate, row.visitor.delta);
  const bStatus = getStatus(row.blog.rate, row.blog.delta);

  return (
    <div
      className={`grid grid-cols-[36px_minmax(140px,220px)_repeat(3,78px)_repeat(3,78px)_32px] gap-2 px-3 py-2.5 border-b last:border-b-0 text-sm items-center transition-colors ${
        row.isMine ? "bg-primary/10 border-l-2 border-l-primary font-semibold" : "hover:bg-muted/20"
      }`}
    >
      {/* 순위 */}
      <div className="text-center">
        {rank === 1 && <Crown size={12} className="inline text-amber-500 mr-0.5" />}
        <span className={`text-xs font-bold ${row.isMine ? "text-primary" : "text-muted-foreground"}`}>
          {rank}
        </span>
      </div>
      {/* 매장명 */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`truncate ${row.isMine ? "text-primary" : ""}`}>{row.name}</span>
        {row.isMine && <span className="text-[9px] px-1 py-0 rounded bg-primary text-primary-foreground font-bold">나</span>}
      </div>
      {/* 방문자 */}
      <div className="text-right font-mono text-xs border-l border-border/50 pl-1">
        {row.visitor.cumulative != null ? row.visitor.cumulative.toLocaleString() : "-"}
      </div>
      <div className={`text-right font-mono text-xs font-bold ${clr(row.visitor.delta)}`}>
        {fmtDelta(row.visitor.delta)}
      </div>
      <div className="text-right font-mono text-xs border-r border-border/50 pr-1 flex items-center justify-end gap-1">
        <span className={`font-bold ${clr(row.visitor.rate)}`}>{fmtRate(row.visitor.rate)}</span>
        <Badge variant="outline" className={`text-[9px] px-1 py-0 font-normal ${vStatus.color}`}>
          {vStatus.label}
        </Badge>
      </div>
      {/* 블로그 */}
      <div className="text-right font-mono text-xs pl-1">
        {row.blog.cumulative != null ? row.blog.cumulative.toLocaleString() : "-"}
      </div>
      <div className={`text-right font-mono text-xs font-bold ${clr(row.blog.delta)}`}>
        {fmtDelta(row.blog.delta)}
      </div>
      <div className="text-right font-mono text-xs border-r border-border/50 pr-1 flex items-center justify-end gap-1">
        <span className={`font-bold ${clr(row.blog.rate)}`}>{fmtRate(row.blog.rate)}</span>
        <Badge variant="outline" className={`text-[9px] px-1 py-0 font-normal ${bStatus.color}`}>
          {bStatus.label}
        </Badge>
      </div>
      {/* 삭제 */}
      <div className="text-center">
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-muted-foreground/40 hover:text-red-500 transition-colors inline-flex items-center justify-center p-2 -m-2 min-w-[36px] min-h-[36px]"
            title="삭제"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

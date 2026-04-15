"use client";

import { useState } from "react";
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
  Plus, Loader2, RefreshCw, Crown, Trash2,
  MessageSquare, FileText, AlertTriangle, Activity, Info,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { ConsultationCTA } from "@/components/common/consultation-cta";

type Period = "date" | "day" | "week" | "month";
const PERIOD_LABEL: Record<Period, string> = { date: "날짜", day: "일", week: "주", month: "월" };

type DailyRow = {
  name: string;
  placeId: string | null;
  visitorAvg7: number | null;
  blogAvg7: number | null;
  visitorTotal: number | null;
  blogTotal: number | null;
  deltas?: {
    visitor: { day: number | null; week: number | null; month: number | null };
    blog: { day: number | null; week: number | null; month: number | null };
  };
};

export default function CompetitorsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: competitors, refetch } = useCompetitors(storeId);
  const { data: comparison, isLoading } = useCompetitorComparison(storeId);
  const addComp = useAddCompetitor(storeId);
  const deleteComp = useDeleteCompetitor(storeId);
  const [newName, setNewName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [selectedDate, setSelectedDate] = useState<string>("");

  const { data: dailyResp } = useQuery<{ competitors: DailyRow[]; summary: any }>({
    queryKey: ["competitors-daily", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/competitors/daily`).then((r) => r.data),
    enabled: !!storeId,
  });

  const { data: flow } = useQuery<any>({
    queryKey: ["store-flow", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/flow`).then((r) => r.data),
    enabled: !!storeId,
  });

  const { data: timelineResp } = useQuery<{ competitors: Array<{ placeId: string; name: string; days: Array<{ date: string; visitorDelta: number | null; blogDelta: number | null; visitor: number | null; blog: number | null }> }> }>({
    queryKey: ["competitors-timeline", storeId],
    queryFn: () => apiClient.get(`/stores/${storeId}/competitors/timeline`).then((r) => r.data),
    enabled: !!storeId,
  });

  // 이용 가능한 날짜 목록 (가장 최근 순)
  const availableDates = Array.from(
    new Set(
      (timelineResp?.competitors ?? []).flatMap((c) => c.days.map((d) => d.date)),
    ),
  ).sort((a, b) => (a < b ? 1 : -1));

  // 기본 선택 날짜 = 최신
  const effectiveDate = selectedDate || availableDates[0] || "";

  const timelineByPid = new Map<string, Map<string, { visitorDelta: number | null; blogDelta: number | null; visitor: number | null; blog: number | null }>>();
  for (const c of timelineResp?.competitors ?? []) {
    const m = new Map<string, any>();
    for (const d of c.days) m.set(d.date, d);
    if (c.placeId) timelineByPid.set(c.placeId, m);
  }

  const comps = competitors ?? [];
  const myStore = comparison?.store;
  const compData: any[] = comparison?.competitors ?? [];
  const dailyRows = dailyResp?.competitors ?? [];

  // placeId/이름 기준 daily 머지
  const dailyByKey = new Map<string, DailyRow>();
  for (const d of dailyRows) {
    if (d.placeId) dailyByKey.set(`pid:${d.placeId}`, d);
    dailyByKey.set(`name:${d.name}`, d);
  }

  const myVisitorAvg = flow?.visitor?.last7DaysAvg ?? null;
  const myBlogAvg = flow?.blog?.last7DaysAvg ?? null;
  const myVisitorTotal = flow?.visitor?.current ?? myStore?.receiptReviewCount ?? 0;
  const myBlogTotal = flow?.blog?.current ?? myStore?.blogReviewCount ?? 0;

  const merged = compData.map((c) => {
    const d =
      (c.placeId && dailyByKey.get(`pid:${c.placeId}`)) ||
      dailyByKey.get(`name:${c.name}`) ||
      null;
    return {
      ...c,
      visitorAvg7: d?.visitorAvg7 ?? null,
      blogAvg7: d?.blogAvg7 ?? null,
      dailySum: (d?.visitorAvg7 ?? 0) + (d?.blogAvg7 ?? 0),
    };
  });

  // 일평균 발행량 기준 정렬
  const sorted = [...merged].sort((a, b) => b.dailySum - a.dailySum);
  const topByDaily = sorted[0];

  const handleAdd = () => {
    const name = newName.trim();
    if (name.length < 2) return toast.error("2글자 이상 입력");
    if (comps.some((c: any) => c.competitorName === name)) return toast.error("이미 등록됨");
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
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const hasDailyData = sorted.some((c) => c.visitorAvg7 != null || c.blogAvg7 != null);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">경쟁 비교</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            일평균 발행 속도 기준 · 경쟁사 {comps.length}곳
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
          데이터 갱신
        </Button>
      </div>

      {/* === 누적 수치 요약 (상단 한 줄) === */}
      {myStore && sorted.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info size={12} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-semibold">누적 수치 (참고)</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <SummaryPill label="내 방문자 리뷰" value={myVisitorTotal} />
              <SummaryPill label="내 블로그 리뷰" value={myBlogTotal} />
              <SummaryPill
                label="경쟁사 평균 방문자"
                value={Math.round(sorted.reduce((s, c) => s + (c.receiptReviewCount ?? 0), 0) / sorted.length)}
              />
              <SummaryPill
                label="경쟁사 평균 블로그"
                value={Math.round(sorted.reduce((s, c) => s + (c.blogReviewCount ?? 0), 0) / sorted.length)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* === 핵심: 일평균 발행 속도 비교 === */}
      {!hasDailyData && sorted.length > 0 && (
        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground flex items-start gap-2">
            <Activity size={14} className="mt-0.5" />
            <div>
              <div className="font-semibold text-foreground mb-0.5">일별 스냅샷 수집 중</div>
              일평균 발행 속도는 매일 자정에 수집됩니다. 최소 2~3일 데이터가 쌓이면 속도 비교가 표시됩니다.
            </div>
          </CardContent>
        </Card>
      )}

      {sorted.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold">기간별 발행 변동량 비교</h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground mr-1">기간</span>
              {(["date", "day", "week", "month"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    period === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white hover:bg-muted/50 border-border"
                  }`}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
              {period === "date" && availableDates.length > 0 && (
                <select
                  value={effectiveDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="ml-2 px-2 py-1 text-xs border rounded-md bg-white"
                >
                  {availableDates.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {period === "date"
              ? effectiveDate
                ? `${effectiveDate} 당일 발행량(전일 대비 증가량)`
                : "선택 가능한 날짜가 없습니다 — 스냅샷 수집 대기 중"
              : period === "day"
                ? "최근 1일 총 증가량 · 많이 쌓는 매장 순"
                : period === "week"
                  ? "최근 7일 총 증가량 · 많이 쌓는 매장 순"
                  : "최근 30일 총 증가량 · 많이 쌓는 매장 순"}
          </p>
          {sorted.map((c, idx) => (
            <DailyCompetitorCard
              key={c.id}
              rank={idx + 1}
              isTop={topByDaily?.id === c.id}
              competitor={c}
              myFlow={flow}
              period={period}
              date={effectiveDate}
              dateRow={c.placeId ? timelineByPid.get(c.placeId)?.get(effectiveDate) ?? null : null}
              myTimeline={flow?.timeline ?? []}
              onDelete={() => {
                if (!confirm(`"${c.name}" 삭제?`)) return;
                deleteComp.mutate(c.id, {
                  onSuccess: () => toast.success("삭제됨"),
                });
              }}
            />
          ))}
        </div>
      )}

      {/* === 경쟁사 추가 === */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Plus size={14} className="text-primary" />
            <span className="font-semibold text-sm">경쟁사 추가</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            매장명 입력 → 네이버 자동 검색 → 일별 스냅샷 수집 시작
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

      {sorted.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <AlertTriangle size={20} className="mx-auto mb-2 text-amber-500" />
            등록된 경쟁사가 없습니다 — 위에서 추가하세요
          </CardContent>
        </Card>
      )}

      {storeId && sorted.length > 0 && (
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

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-base font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

function DailyCompetitorCard({
  rank, isTop, competitor: c, myFlow, period, date, dateRow, myTimeline, onDelete,
}: {
  rank: number;
  isTop: boolean;
  competitor: any;
  myFlow: any;
  period: Period;
  date: string;
  dateRow: { visitorDelta: number | null; blogDelta: number | null } | null;
  myTimeline: Array<{ date: string; visitorDelta: number | null; blogDelta: number | null }>;
  onDelete: () => void;
}) {
  // 기간별 경쟁사 변동량
  let cV: number | null = null;
  let cB: number | null = null;
  let myV: number | null = null;
  let myB: number | null = null;

  if (period === "date") {
    // 선택 날짜 하루 delta
    cV = dateRow?.visitorDelta ?? null;
    cB = dateRow?.blogDelta ?? null;
    const myRow = myTimeline.find((t) => {
      const d = typeof t.date === "string" ? t.date.slice(0, 10) : new Date(t.date as any).toISOString().slice(0, 10);
      return d === date;
    });
    myV = myRow?.visitorDelta ?? null;
    myB = myRow?.blogDelta ?? null;
  } else {
    cV = c.deltas?.visitor?.[period] ?? null;
    cB = c.deltas?.blog?.[period] ?? null;
    const myVKey = period === "day" ? "deltaDay" : period === "week" ? "deltaWeek" : "deltaMonth";
    myV = myFlow?.visitor?.[myVKey] ?? null;
    myB = myFlow?.blog?.[myVKey] ?? null;
  }

  const hasData = cV != null || cB != null || myV != null || myB != null;

  const visitorDelta = myV != null && cV != null ? +(myV - cV).toFixed(1) : null;
  const blogDelta = myB != null && cB != null ? +(myB - cB).toFixed(1) : null;

  const aheadCount = [visitorDelta, blogDelta].filter((d) => d != null && d > 0).length;
  const behindCount = [visitorDelta, blogDelta].filter((d) => d != null && d < 0).length;

  let statusLabel = "데이터 수집 중";
  let statusColor = "bg-muted text-muted-foreground border-border";
  let diagnosis = "일별 스냅샷이 2~3일치 쌓이면 속도 비교가 가능합니다.";

  if (hasData && (visitorDelta != null || blogDelta != null)) {
    if (aheadCount === 2) {
      statusLabel = "속도 우위";
      statusColor = "bg-green-100 text-green-700 border-green-200";
      diagnosis = "내 매장이 방문자·블로그 모두 빠른 속도로 발행 중. 이 속도 유지가 핵심.";
    } else if (aheadCount === 1 && behindCount === 0) {
      statusLabel = "부분 우위";
      statusColor = "bg-green-50 text-green-600 border-green-200";
      diagnosis = "일부 지표만 앞섬. 뒤처진 축을 맞추면 완전 우위 가능.";
    } else if (behindCount === 2) {
      const gapSum = Math.abs((visitorDelta ?? 0)) + Math.abs((blogDelta ?? 0));
      if (gapSum > 10) {
        statusLabel = "속도 크게 뒤처짐";
        statusColor = "bg-red-100 text-red-700 border-red-200";
        diagnosis = "경쟁사 발행 속도가 매우 빠름 — 현 속도로는 격차 계속 벌어짐. 리뷰·블로그 생성 집중 필요.";
      } else {
        statusLabel = "속도 부족";
        statusColor = "bg-red-50 text-red-600 border-red-200";
        diagnosis = "두 지표 모두 경쟁사보다 느림. 일평균 발행량을 끌어올려야 추격 가능.";
      }
    } else if (behindCount === 1 && aheadCount === 1) {
      statusLabel = "혼재";
      statusColor = "bg-amber-50 text-amber-600 border-amber-200";
      diagnosis = "한쪽은 앞서고 한쪽은 뒤처짐. 약점 축 보강으로 균형 잡기.";
    } else {
      statusLabel = "동등";
      statusColor = "bg-muted/50 text-muted-foreground border-border";
      diagnosis = "속도가 비슷한 구간. 콘텐츠 품질·전환 중심 전략.";
    }
  }

  return (
    <Card className={isTop ? "border-amber-300" : ""}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-semibold">#{rank}</span>
              {isTop && <Crown size={12} className="text-amber-500" />}
              <h4 className="font-bold text-base">{c.name}</h4>
              <Badge variant="outline" className={`text-[10px] py-0 ${statusColor}`}>
                {statusLabel}
              </Badge>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onDelete}>
            <Trash2 size={12} className="text-muted-foreground hover:text-red-500" />
          </Button>
        </div>

        <div className="space-y-3">
          <DailyBar
            label="방문자 리뷰"
            periodLabel={period === "date" ? date : `최근 ${PERIOD_LABEL[period]}`}
            icon={MessageSquare}
            my={myV}
            their={cV}
            delta={visitorDelta}
            cumulativeTheir={c.receiptReviewCount}
          />
          <DailyBar
            label="블로그 리뷰"
            periodLabel={period === "date" ? date : `최근 ${PERIOD_LABEL[period]}`}
            icon={FileText}
            my={myB}
            their={cB}
            delta={blogDelta}
            cumulativeTheir={c.blogReviewCount}
          />
        </div>

        <div className="mt-4 pt-3 border-t flex items-start gap-2">
          <span className="text-xs">💡</span>
          <p className="text-xs text-muted-foreground leading-relaxed flex-1">
            <span className="font-semibold text-foreground">진단: </span>
            {diagnosis}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyBar({
  label, periodLabel, icon: Icon, my, their, delta, cumulativeTheir,
}: {
  label: string;
  periodLabel: string;
  icon: any;
  my: number | null;
  their: number | null;
  delta: number | null;
  cumulativeTheir: number | null;
}) {
  const myVal = my ?? 0;
  const theirVal = their ?? 0;
  const max = Math.max(myVal, theirVal, 1);
  const myWidth = Math.min(100, (myVal / max) * 100);
  const theirWidth = Math.min(100, (theirVal / max) * 100);

  const fmt = (v: number | null) => (v == null ? "-" : v > 0 ? `+${v}` : `${v}`);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon size={11} />
          {label}
          <span className="text-[10px] text-muted-foreground/70">· {periodLabel} 변동량</span>
        </div>
        <DeltaBadge value={delta} />
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-10 shrink-0 font-semibold">나</span>
          <div className="flex-1 h-5 bg-muted/30 rounded-md overflow-hidden">
            <div
              className="h-full bg-primary rounded-md transition-all flex items-center justify-end px-2"
              style={{ width: `${myWidth}%` }}
            >
              <span className="text-[10px] font-bold text-white">{fmt(my)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-10 shrink-0">경쟁</span>
          <div className="flex-1 h-5 bg-muted/30 rounded-md overflow-hidden">
            <div
              className="h-full bg-muted-foreground/40 rounded-md transition-all flex items-center justify-end px-2"
              style={{ width: `${theirWidth}%` }}
            >
              <span className="text-[10px] font-bold text-white">{fmt(their)}</span>
            </div>
          </div>
          {cumulativeTheir != null && cumulativeTheir > 0 && (
            <span className="text-[9px] text-muted-foreground w-16 shrink-0 text-right">
              누적 {cumulativeTheir.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-0.5"><Minus size={12} />수집중</span>;
  }
  if (value > 0) {
    return <span className="text-xs font-bold text-green-600 inline-flex items-center gap-0.5"><TrendingUp size={12} />+{value}</span>;
  }
  if (value < 0) {
    return <span className="text-xs font-bold text-red-600 inline-flex items-center gap-0.5"><TrendingDown size={12} />{value}</span>;
  }
  return <span className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-0.5"><Minus size={12} />0</span>;
}

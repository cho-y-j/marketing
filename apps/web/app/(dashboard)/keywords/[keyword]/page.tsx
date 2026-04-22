"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { apiClient } from "@/lib/api-client";
import {
  ArrowLeft, Crown, MessageSquare, FileText, TrendingUp,
  Search, Lightbulb, Loader2, Flame, ArrowUp, ArrowDown, Minus,
} from "lucide-react";

const COMPARE_OPTIONS = [
  { days: 1, label: "1일전" },
  { days: 5, label: "5일전" },
  { days: 7, label: "7일전" },
  { days: 14, label: "14일전" },
  { days: 30, label: "30일전" },
  { days: 60, label: "60일전" },
];

export default function KeywordDetailPage({
  params,
}: {
  params: Promise<{ keyword: string }>;
}) {
  const { keyword: encodedKeyword } = use(params);
  const keyword = decodeURIComponent(encodedKeyword);
  const { storeId } = useCurrentStoreId();
  const [compareDays, setCompareDays] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["keyword-competition", storeId, keyword, compareDays],
    queryFn: () =>
      apiClient
        .get(`/stores/${storeId}/keywords/competition/${encodeURIComponent(keyword)}`, {
          params: { compareDays },
        })
        .then((r) => r.data),
    enabled: !!storeId && !!keyword,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center">
        <p className="text-muted-foreground">데이터를 불러올 수 없습니다</p>
      </div>
    );
  }

  const {
    topPlaces = [], myRank, monthlyVolume, totalResults,
    trend = [], insights = [], actualCompareDays, compareApproximate,
  } = data;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/keywords">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} className="mr-1" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-primary" />
            <h2 className="text-xl font-bold">{keyword}</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {monthlyVolume ? `월 ${monthlyVolume.toLocaleString()}회 검색 · ` : ""}
            {totalResults ? `${totalResults}개 매장 노출` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <Loader2 size={14} className="mr-1" />
          새로고침
        </Button>
      </div>

      {/* 핵심 지표 — 이 키워드 하나에 특정된 것만 */}
      <div className="grid grid-cols-3 gap-3">
        <KeyMetric
          label="내 순위"
          value={myRank ? `${myRank}위` : "100위 밖"}
          color={myRank && myRank <= 3 ? "blue" : myRank && myRank <= 10 ? "default" : "red"}
        />
        <KeyMetric
          label="월 검색량"
          value={monthlyVolume ? `${monthlyVolume.toLocaleString()}` : "-"}
          suffix="회/월"
        />
        <KeyMetric
          label="노출 매장"
          value={totalResults ? `${totalResults}` : "-"}
          suffix="개 (Top)"
        />
      </div>

      {/* 인사이트 */}
      {insights.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-4">
            <div className="flex items-start gap-2 mb-2">
              <Lightbulb size={16} className="text-amber-600 mt-0.5" />
              <span className="font-semibold text-sm">분석 인사이트</span>
            </div>
            <ul className="space-y-1 ml-6">
              {insights.map((s: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground list-disc">{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Top 10 경쟁 매트릭스 */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-muted-foreground">
            {keyword} 검색 결과 Top {topPlaces.length}
          </h3>
          {/* N일전 비교 탭 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {COMPARE_OPTIONS.map((opt) => (
                <Button
                  key={opt.days}
                  size="sm"
                  variant={compareDays === opt.days ? "default" : "outline"}
                  className="text-[11px] min-h-[36px] px-3"
                  onClick={() => setCompareDays(opt.days)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            {actualCompareDays != null && (
              <span className={`text-[11px] ${compareApproximate ? "text-amber-600" : "text-muted-foreground"}`}>
                {compareApproximate
                  ? `실제 비교: ${actualCompareDays}일 전 (데이터 없어 근사)`
                  : `실제 비교: ${actualCompareDays}일 전`}
              </span>
            )}
          </div>
        </div>
        {/* 데스크탑 — 테이블 */}
        <Card className="hidden md:block">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-center px-3 py-2.5 font-medium w-16">순위</th>
                  <th className="text-center px-2 py-2.5 font-medium w-14">
                    변동
                    {actualCompareDays != null && (
                      <div className="text-[9px] font-normal text-muted-foreground">
                        {actualCompareDays}일 기준
                      </div>
                    )}
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">매장</th>
                  <th className="text-center px-3 py-2.5 font-medium">
                    방문자리뷰
                    {actualCompareDays != null && (
                      <div className="text-[9px] font-normal text-muted-foreground">
                        누적 · +{actualCompareDays}일
                      </div>
                    )}
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium">
                    블로그리뷰
                    {actualCompareDays != null && (
                      <div className="text-[9px] font-normal text-muted-foreground">
                        누적 · +{actualCompareDays}일
                      </div>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {topPlaces.map((p: any, i: number) => (
                  <tr
                    key={i}
                    className={`border-t ${
                      p.isMine
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="text-center px-3 py-2.5 font-bold">
                      {p.rank === 1 ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Crown size={14} className="text-yellow-500" />
                          <span className="text-yellow-600">1</span>
                        </span>
                      ) : (
                        <span className={
                          p.rank <= 3 ? "text-brand" :
                          p.rank <= 10 ? "text-foreground" : "text-muted-foreground"
                        }>{p.rank}</span>
                      )}
                      {p.isHot && (
                        <Badge variant="destructive" className="ml-1 text-[9px] py-0 px-1">
                          <Flame size={8} className="mr-0.5" />Hot
                        </Badge>
                      )}
                    </td>
                    <td className="text-center px-2 py-2.5">
                      <RankChange change={p.rankChange} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={p.isMine ? "font-bold" : "font-medium"}>{p.name}</span>
                      {p.isMine && (
                        <Badge className="ml-1.5 text-[10px] py-0">나</Badge>
                      )}
                      {p.category && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{p.category}</p>
                      )}
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <MetricCell
                        value={p.visitorReviewCount}
                        icon={MessageSquare}
                        delta={p.visitorDelta}
                        isEstimated={p.deltaSource === "backfill" || p.deltaSource === "estimate"}
                      />
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <MetricCell
                        value={p.blogReviewCount}
                        icon={FileText}
                        delta={p.blogDelta}
                        isEstimated={p.deltaSource === "backfill" || p.deltaSource === "estimate"}
                      />
                    </td>
                  </tr>
                ))}
                {topPlaces.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-sm text-muted-foreground">
                      이 키워드로 노출되는 매장이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* 모바일 — 카드 리스트 (가로 스크롤 없이 한눈에) */}
        <div className="md:hidden space-y-2">
          {topPlaces.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                이 키워드로 노출되는 매장이 없습니다
              </CardContent>
            </Card>
          )}
          {topPlaces.map((p: any, i: number) => {
            const isEst = p.deltaSource === "backfill" || p.deltaSource === "estimate";
            return (
              <Card
                key={i}
                className={p.isMine ? "bg-primary/10 ring-1 ring-primary/30" : ""}
              >
                <CardContent className="p-3">
                  {/* 1행: 순위 + 변동 + 매장명 + 나 */}
                  <div className="flex items-start gap-2 mb-1.5">
                    <div className="shrink-0 flex flex-col items-center w-9">
                      {p.rank === 1 ? (
                        <Crown size={18} className="text-yellow-500" />
                      ) : (
                        <span className={`text-base font-black leading-none ${
                          p.rank <= 3 ? "text-brand" :
                          p.rank <= 10 ? "text-foreground" : "text-muted-foreground"
                        }`}>{p.rank}</span>
                      )}
                      <div className="mt-0.5">
                        <RankChange change={p.rankChange} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm truncate ${p.isMine ? "font-bold" : "font-semibold"}`}>
                          {p.name}
                        </span>
                        {p.isMine && <Badge className="text-[10px] py-0 px-1.5">나</Badge>}
                        {p.isHot && (
                          <Badge variant="destructive" className="text-[9px] py-0 px-1">
                            <Flame size={8} className="mr-0.5" />Hot
                          </Badge>
                        )}
                      </div>
                      {p.category && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.category}</p>
                      )}
                    </div>
                  </div>
                  {/* 2행: 방문자 / 블로그 2열 */}
                  <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-border/50">
                    <MobileMetric
                      label="방문자 리뷰"
                      icon={MessageSquare}
                      value={p.visitorReviewCount}
                      delta={p.visitorDelta}
                      isEstimated={isEst}
                    />
                    <MobileMetric
                      label="블로그 리뷰"
                      icon={FileText}
                      value={p.blogReviewCount}
                      delta={p.blogDelta}
                      isEstimated={isEst}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 순위 추이 (간단 텍스트) */}
      {trend.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-primary" />
              <span className="font-semibold text-sm">최근 순위 추이 ({trend.length}회 측정)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {trend.slice(-14).map((t: any, i: number) => (
                <div key={i} className="text-center bg-muted/30 rounded-md px-2.5 py-1.5">
                  <div className="text-[10px] text-muted-foreground">{t.date.slice(5)}</div>
                  <div className={`text-sm font-bold ${
                    t.rank == null ? "text-muted-foreground" :
                    t.rank <= 3 ? "text-brand" :
                    t.rank <= 10 ? "text-foreground" : "text-red-500"
                  }`}>
                    {t.rank ? `${t.rank}위` : "권외"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KeyMetric({
  label, value, color = "default", suffix,
}: {
  label: string;
  value: string;
  color?: "default" | "blue" | "red";
  suffix?: string;
}) {
  const colorClass = color === "blue" ? "text-brand" : color === "red" ? "text-red-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-2xl font-black ${colorClass}`}>{value}</p>
        {suffix && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{suffix}</p>}
      </CardContent>
    </Card>
  );
}

function MobileMetric({
  label, icon: Icon, value, delta, isEstimated,
}: {
  label: string;
  icon: any;
  value?: number | null;
  delta?: number | null;
  isEstimated?: boolean;
}) {
  const prefix = isEstimated ? "~" : "";
  const deltaNode =
    delta == null ? null :
    delta === 0 ? <span className="text-muted-foreground">{prefix}±0</span> :
    delta > 0 ? <span className="text-green-600 font-bold">{prefix}+{delta}</span> :
    <span className="text-red-600 font-bold">{prefix}{delta}</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon size={10} />
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-bold">
          {value != null ? value.toLocaleString() : "-"}
        </span>
        <span className="text-[11px]">{deltaNode}</span>
      </div>
    </div>
  );
}

function MetricCell({
  value, icon: Icon, delta, isEstimated,
}: { value?: number; icon: any; delta?: number | null; isEstimated?: boolean }) {
  if (value == null || value === 0) return <span className="text-muted-foreground">-</span>;
  const prefix = isEstimated ? "~" : "";
  const deltaNode =
    delta == null ? null :
    delta === 0 ? <span className="text-[10px] text-muted-foreground">{prefix}±0</span> :
    delta > 0 ? <span className="text-[10px] text-green-600 font-semibold">{prefix}+{delta}</span> :
    <span className="text-[10px] text-red-600 font-semibold">{prefix}{delta}</span>;
  return (
    <span className="inline-flex flex-col items-center gap-0">
      <span className="inline-flex items-center gap-1 text-sm">
        <Icon size={11} className="text-muted-foreground" />
        {value.toLocaleString()}
      </span>
      {deltaNode}
    </span>
  );
}

function RankChange({ change }: { change: number | null }) {
  if (change == null)
    return <span className="text-[10px] text-muted-foreground/60">기록없음</span>;
  if (change === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Minus size={10} /> 동일
      </span>
    );
  }
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-green-600">
        <ArrowUp size={11} />
        {change}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-red-600">
      <ArrowDown size={11} />
      {Math.abs(change)}
    </span>
  );
}

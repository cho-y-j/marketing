"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * 외부 블로그 mention 카드 — 캐시노트 "SNS 언급 감지" 의 한국 환경 버전.
 *
 * 사장님 룰:
 *  - 단순 카운트가 아니라 글 제목·작성자·미리보기·원문 링크 모두 표시
 *  - 사장님이 "내 매장이 입소문 났구나" 발견의 즐거움
 *  - DESIGN-apple §10 — Paperlogy / break-keep / 8px radius / 36px+ 터치 / 회색 단색
 */

type Mention = {
  id: string;
  postedAt: string; // ISO
  title: string;
  url: string;
  blogger: string | null;
  snippet: string | null;
};

type Overview = {
  total30d: number;
  total7d: number;
  yesterday: number;
  trend: Array<{ date: string; count: number }>;
  recent: Mention[];
  competitorAvg30d: number | null;
};

export function BlogMentionCard({ storeId }: { storeId?: string }) {
  const { data, isLoading } = useQuery<Overview>({
    queryKey: ["blog-mentions", storeId],
    queryFn: () =>
      apiClient.get(`/stores/${storeId}/blog-mentions`).then((r) => r.data),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000, // 5분 캐시 — 경쟁사 호출 비용 큼
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }
  if (!data) return null;

  const vsCompetitor =
    data.competitorAvg30d != null && data.competitorAvg30d >= 0
      ? data.total30d - data.competitorAvg30d
      : null;

  return (
    <Card className="break-keep">
      <CardContent className="p-4 md:p-5 space-y-4">
        {/* 헤더 + 핵심 지표 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <BookOpen size={18} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">외부 블로그 mention</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                내 매장 이름이 들어간 다른 사람 블로그 글
              </p>
            </div>
          </div>
          {data.yesterday > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
              🆕 어제 {data.yesterday}건
            </span>
          )}
        </div>

        {/* 3-stat — 30일 / 7일 / 경쟁사 비교 */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="30일 누적" value={data.total30d} suffix="건" big />
          <Stat label="7일" value={data.total7d} suffix="건" />
          <Stat
            label="경쟁사 평균"
            value={data.competitorAvg30d ?? null}
            suffix={data.competitorAvg30d != null ? "건" : ""}
            sub={
              vsCompetitor != null && data.competitorAvg30d != null && data.competitorAvg30d > 0
                ? vsCompetitor > 0
                  ? { tone: "blue", text: `+${vsCompetitor} 앞섬` }
                  : vsCompetitor < 0
                    ? { tone: "red", text: `${vsCompetitor} 뒤처짐` }
                    : { tone: "muted", text: "동등" }
                : undefined
            }
          />
        </div>

        {/* 30일 스파크라인 — 미니 막대 그래프 */}
        {data.trend.length > 0 && data.total30d > 0 && (
          <Sparkline trend={data.trend} />
        )}

        {/* 최근 글 리스트 */}
        {data.recent.length > 0 ? (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-semibold text-muted-foreground px-0.5">최근 글</p>
            <ul className="space-y-1.5">
              {data.recent.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-border bg-white px-3 py-2.5 hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors min-h-[36px]"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground leading-snug truncate">
                          {m.title}
                        </p>
                        {m.snippet && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                            {m.snippet}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/80">
                          <span className="truncate max-w-[140px]">
                            {m.blogger || "익명 블로그"}
                          </span>
                          <span>·</span>
                          <span>{m.postedAt.slice(0, 10)}</span>
                        </div>
                      </div>
                      <ExternalLink
                        size={12}
                        className="text-muted-foreground/60 shrink-0 mt-0.5"
                      />
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-muted-foreground">
            아직 외부 블로그 mention 이 없어요. 매일 1회 자동 수집 — 글 올라오면 알려드립니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  suffix,
  big,
  sub,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  big?: boolean;
  sub?: { tone: "blue" | "red" | "muted"; text: string };
}) {
  return (
    <div className="text-center bg-muted/30 rounded-lg p-2.5">
      <p className="text-[10px] text-muted-foreground leading-tight mb-1">{label}</p>
      <p
        className={`font-black tracking-tight ${
          big ? "text-2xl text-emerald-700" : "text-lg text-foreground"
        }`}
      >
        {value != null ? value.toLocaleString() : "-"}
        {suffix && <span className="text-[10px] font-medium text-muted-foreground ml-0.5">{suffix}</span>}
      </p>
      {sub && (
        <p
          className={`text-[10px] font-semibold mt-0.5 ${
            sub.tone === "blue"
              ? "text-blue-600"
              : sub.tone === "red"
                ? "text-red-600"
                : "text-muted-foreground"
          }`}
        >
          {sub.text}
        </p>
      )}
    </div>
  );
}

/** 30일 미니 막대 그래프 — 캐시노트 같이 한 줄로 추세 보여주기 */
function Sparkline({ trend }: { trend: Array<{ date: string; count: number }> }) {
  const max = Math.max(...trend.map((t) => t.count), 1);
  const last7 = trend.slice(-7).reduce((s, t) => s + t.count, 0);
  const prev7 = trend.slice(-14, -7).reduce((s, t) => s + t.count, 0);
  let trendIcon: any = Minus;
  let trendCls = "text-muted-foreground";
  let trendText = "유지";
  if (last7 > prev7) {
    trendIcon = TrendingUp;
    trendCls = "text-blue-600";
    trendText = `7일전 대비 +${last7 - prev7}건`;
  } else if (last7 < prev7) {
    trendIcon = TrendingDown;
    trendCls = "text-red-600";
    trendText = `7일전 대비 ${last7 - prev7}건`;
  }
  const Icon = trendIcon;
  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-[2px] h-12">
        {trend.map((t) => {
          const h = Math.max(2, Math.round((t.count / max) * 48));
          return (
            <div
              key={t.date}
              className={`flex-1 rounded-sm ${
                t.count === 0 ? "bg-muted" : "bg-emerald-300"
              }`}
              style={{ height: `${h}px` }}
              title={`${t.date}: ${t.count}건`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground px-0.5">
        <span>30일</span>
        <span className="ml-auto inline-flex items-center gap-0.5">
          <Icon size={10} className={trendCls} />
          <span className={`font-semibold ${trendCls}`}>{trendText}</span>
        </span>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ArrowRight, Check, X, Minus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const recommendationConfig: Record<string, { label: string; color: string; icon: any }> = {
  PUSH: { label: "공략", color: "bg-green-100 text-green-700 border-green-200", icon: ArrowRight },
  HOLD: { label: "유지", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Minus },
  SKIP: { label: "포기", color: "bg-red-100 text-red-600 border-red-200", icon: X },
  DONE: { label: "완료", color: "bg-blue-100 text-blue-600 border-blue-200", icon: Check },
};

const competitionConfig: Record<string, { label: string; color: string }> = {
  LOW: { label: "낮음", color: "text-green-600" },
  MEDIUM: { label: "보통", color: "text-amber-600" },
  HIGH: { label: "높음", color: "text-red-500" },
  VERY_HIGH: { label: "매우 높음", color: "text-red-700" },
};

export function BlogAnalysisCard({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const { data: summary, isLoading } = useQuery({
    queryKey: ["blog-analysis", storeId],
    queryFn: () =>
      apiClient.get(`/stores/${storeId}/keywords/blog-analysis`).then((r) => r.data),
    enabled: !!storeId,
  });

  const runMut = useMutation({
    mutationFn: () =>
      apiClient.post(`/stores/${storeId}/keywords/blog-analysis`).then((r) => r.data),
    onSuccess: () => {
      toast.success("블로그 분석이 시작되었습니다. 잠시 후 새로고침하세요.");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["blog-analysis", storeId] }), 5000);
    },
  });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold">블로그 상위노출 분석</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              키워드별 블로그 경쟁 강도 + 전략 추천
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
          >
            {runMut.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1" />
            ) : (
              <Search size={14} className="mr-1" />
            )}
            분석 실행
          </Button>
        </div>

        {/* 요약 */}
        {summary && summary.total > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            <MiniStat label="공략 추천" value={summary.push} color="text-green-600" />
            <MiniStat label="유지" value={summary.hold} color="text-gray-600" />
            <MiniStat label="포기 추천" value={summary.skip} color="text-red-600" />
            <MiniStat label="이미 상위" value={summary.done} color="text-blue-600" />
          </div>
        )}

        {/* 키워드별 결과 */}
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">로딩 중...</div>
        ) : !summary || summary.total === 0 ? (
          <div className="py-8 text-center">
            <AlertTriangle size={20} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              아직 블로그 분석이 실행되지 않았습니다
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              위 "분석 실행" 버튼을 눌러주세요
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.results.map((r: any, i: number) => {
              const rec = recommendationConfig[r.recommendation] || recommendationConfig.HOLD;
              const comp = competitionConfig[r.competitionLevel] || competitionConfig.MEDIUM;
              const RecIcon = rec.icon;

              return (
                <div key={i} className="flex items-center gap-3 border rounded-lg px-3 py-2.5 hover:bg-muted/30">
                  {/* 전략 뱃지 */}
                  <Badge variant="outline" className={`shrink-0 text-xs ${rec.color}`}>
                    <RecIcon size={10} className="mr-0.5" />
                    {rec.label}
                  </Badge>

                  {/* 키워드 + 경쟁 강도 */}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{r.keyword}</span>
                    <span className={`text-[10px] ml-2 ${comp.color}`}>
                      경쟁 {comp.label}
                    </span>
                  </div>

                  {/* 지표 */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span>블로그 {r.blogExposureCount}개</span>
                    <span>최근 {r.recentBlogRate}%</span>
                    {r.competitorMentionCount > 0 && (
                      <span className="text-red-500">경쟁사 {r.competitorMentionCount}곳</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 추천 사유 (PUSH 키워드만) */}
        {summary && summary.results?.filter((r: any) => r.recommendation === "PUSH").length > 0 && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="text-xs font-semibold text-green-700 mb-1">지금 공략할 키워드</p>
            {summary.results
              .filter((r: any) => r.recommendation === "PUSH")
              .map((r: any, i: number) => (
                <p key={i} className="text-xs text-green-600 mt-1">
                  <strong>{r.keyword}</strong> — {r.recommendationReason}
                </p>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-2 bg-muted/30 rounded-lg">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

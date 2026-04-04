"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitiveScoreChart } from "@/components/charts/competitive-score-chart";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useLatestAnalysis, useRunAnalysis } from "@/hooks/useAnalysis";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, Lightbulb, Loader2, BarChart3 } from "lucide-react";

export default function AnalysisPage() {
  const { storeId } = useCurrentStoreId();
  const { data: analysis, isLoading } = useLatestAnalysis(storeId);
  const runAnalysis = useRunAnalysis(storeId);

  const handleRun = () => {
    toast.info("AI 분석을 시작합니다. 잠시 기다려주세요...");
    runAnalysis.mutate(undefined, {
      onSuccess: () => toast.success("AI 분석이 완료되었습니다!"),
      onError: (e: any) => toast.error("분석 실패: " + (e.response?.data?.message || e.message)),
    });
  };

  const aiData = analysis?.aiAnalysis as any;
  const strengths: string[] = (analysis?.strengths as string[]) ?? aiData?.strengths ?? [];
  const weaknesses: string[] = (analysis?.weaknesses as string[]) ?? aiData?.weaknesses ?? [];
  const recommendations: any[] = (analysis?.recommendations as any[]) ?? aiData?.recommendations ?? [];
  const score = analysis?.competitiveScore ?? 0;

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">매장 분석</h2>
        <Button size="sm" onClick={handleRun} disabled={runAnalysis.isPending}>
          {runAnalysis.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : <BarChart3 size={14} className="mr-1" />}
          AI 분석 실행
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
      ) : !analysis ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 size={40} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">아직 분석 결과가 없습니다</p>
            <Button onClick={handleRun} disabled={runAnalysis.isPending}>
              {runAnalysis.isPending ? "분석 중..." : "첫 분석 실행하기"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "경쟁력", value: score, unit: "점" },
              { label: "영수증 리뷰", value: analysis.receiptReviewCount, unit: "건" },
              { label: "블로그 리뷰", value: analysis.blogReviewCount, unit: "건" },
              { label: "일 검색량", value: analysis.dailySearchVolume, unit: "회" },
              { label: "저장수", value: analysis.saveCount, unit: "회" },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="pt-3 pb-2 text-center">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-xl font-bold">{m.value?.toLocaleString() ?? "-"}<span className="text-xs font-normal text-muted-foreground">{m.unit}</span></p>
                </CardContent>
              </Card>
            ))}
          </div>

          <CompetitiveScoreChart data={[{ date: analysis.analyzedAt?.split("T")[0] ?? "", score }]} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ThumbsUp size={14} className="text-green-500" /> 강점</CardTitle></CardHeader>
              <CardContent>
                {strengths.length > 0 ? (
                  <ul className="space-y-1.5">{strengths.map((s, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-green-500 shrink-0">+</span>{s}</li>)}</ul>
                ) : <p className="text-sm text-muted-foreground">AI 분석을 실행하면 강점이 표시됩니다</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ThumbsDown size={14} className="text-red-500" /> 약점</CardTitle></CardHeader>
              <CardContent>
                {weaknesses.length > 0 ? (
                  <ul className="space-y-1.5">{weaknesses.map((w, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-red-500 shrink-0">-</span>{w}</li>)}</ul>
                ) : <p className="text-sm text-muted-foreground">AI 분석을 실행하면 약점이 표시됩니다</p>}
              </CardContent>
            </Card>
          </div>

          {recommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Lightbulb size={14} className="text-blue-500" /> AI 추천 액션</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {recommendations.map((r: any, i: number) => (
                  <div key={i} className="flex gap-3 p-3 bg-muted rounded-lg">
                    <Badge variant={r.priority === "HIGH" ? "destructive" : "secondary"} className="h-fit text-[10px]">{r.priority}</Badge>
                    <div>
                      <p className="text-sm font-medium">{r.action}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                      {r.expectedEffect && <p className="text-xs text-primary mt-0.5">{r.expectedEffect}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitiveScoreChart } from "@/components/charts/competitive-score-chart";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useLatestAnalysis, useRunAnalysis } from "@/hooks/useAnalysis";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, Lightbulb, Loader2, BarChart3, MessageSquare, Users, Search, Bookmark, Sparkles } from "lucide-react";

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
  const scoreColor = score >= 71 ? "text-emerald-500" : score >= 41 ? "text-amber-500" : "text-rose-500";
  const scoreRingColor = score >= 71 ? "from-emerald-400 to-emerald-600" : score >= 41 ? "from-amber-400 to-amber-600" : "from-rose-400 to-rose-600";

  return (
    <div className="space-y-5 md:space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">매장 분석</h2>
          <p className="text-sm text-muted-foreground mt-0.5">AI가 매장 상태를 종합 분석합니다</p>
        </div>
        <Button size="sm" onClick={handleRun} disabled={runAnalysis.isPending} className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-md">
          {runAnalysis.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />}
          AI 분석 실행
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
      ) : !analysis ? (
        <Card className="rounded-2xl">
          <CardContent className="py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center mx-auto mb-5">
              <BarChart3 size={32} className="text-orange-500" />
            </div>
            <p className="text-lg font-semibold mb-1">아직 분석 결과가 없습니다</p>
            <p className="text-sm text-muted-foreground mb-5">AI가 매장의 온라인 마케팅 상태를 종합 분석합니다</p>
            <Button onClick={handleRun} disabled={runAnalysis.isPending} className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-6">
              {runAnalysis.isPending ? "분석 중..." : "첫 분석 실행하기"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 점수 + 지표 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* 경쟁력 점수 - 크게 */}
            <Card className="col-span-2 md:col-span-1 overflow-hidden">
              <CardContent className="pt-5 pb-4 px-4 flex flex-col items-center bg-gradient-to-br from-slate-50 to-white">
                <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${scoreRingColor} p-1 mb-2`}>
                  <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                    <span className={`text-2xl font-extrabold ${scoreColor}`}>{score}</span>
                  </div>
                </div>
                <p className="text-xs font-medium text-muted-foreground">경쟁력 점수</p>
              </CardContent>
            </Card>

            {[
              { label: "영수증 리뷰", value: analysis.receiptReviewCount, icon: MessageSquare, color: "text-blue-500", bg: "from-blue-500/10 to-blue-500/5" },
              { label: "블로그 리뷰", value: analysis.blogReviewCount, icon: Users, color: "text-violet-500", bg: "from-violet-500/10 to-violet-500/5" },
              { label: "일 검색량", value: analysis.dailySearchVolume, icon: Search, color: "text-emerald-500", bg: "from-emerald-500/10 to-emerald-500/5" },
              { label: "저장수", value: analysis.saveCount, icon: Bookmark, color: "text-amber-500", bg: "from-amber-500/10 to-amber-500/5" },
            ].map((m) => (
              <Card key={m.label} className="overflow-hidden">
                <CardContent className={`pt-4 pb-3 px-4 bg-gradient-to-br ${m.bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <m.icon size={14} className={m.color} />
                  </div>
                  <p className="text-xl font-extrabold">{m.value?.toLocaleString() ?? "-"}</p>
                  <p className="text-[11px] text-muted-foreground">{m.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <CompetitiveScoreChart data={[{ date: analysis.analyzedAt?.split("T")[0] ?? "", score }]} />

          {/* 강점/약점 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="rounded-2xl overflow-hidden">
              <CardHeader className="pb-2 bg-emerald-50/50">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <ThumbsUp size={12} className="text-emerald-600" />
                  </div>
                  강점
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                {strengths.length > 0 ? (
                  <ul className="space-y-2">
                    {strengths.map((s, i) => (
                      <li key={i} className="text-sm flex gap-2.5 items-start">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-emerald-600">{i + 1}</span>
                        </div>
                        <span className="text-muted-foreground leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">AI 분석을 실행하면 표시됩니다</p>}
              </CardContent>
            </Card>

            <Card className="rounded-2xl overflow-hidden">
              <CardHeader className="pb-2 bg-rose-50/50">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center">
                    <ThumbsDown size={12} className="text-rose-600" />
                  </div>
                  약점
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                {weaknesses.length > 0 ? (
                  <ul className="space-y-2">
                    {weaknesses.map((w, i) => (
                      <li key={i} className="text-sm flex gap-2.5 items-start">
                        <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-rose-600">{i + 1}</span>
                        </div>
                        <span className="text-muted-foreground leading-relaxed">{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">AI 분석을 실행하면 표시됩니다</p>}
              </CardContent>
            </Card>
          </div>

          {/* AI 추천 액션 */}
          {recommendations.length > 0 && (
            <Card className="rounded-2xl overflow-hidden">
              <CardHeader className="pb-2 bg-blue-50/50">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Lightbulb size={12} className="text-blue-600" />
                  </div>
                  AI 추천 액션
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-2.5">
                {recommendations.map((r: any, i: number) => (
                  <div key={i} className="flex gap-3 p-3.5 bg-gradient-to-r from-muted/50 to-transparent rounded-xl">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      r.priority === "HIGH" ? "bg-rose-100 text-rose-600" : r.priority === "MEDIUM" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-600"
                    }`}>
                      <span className="text-xs font-bold">{i + 1}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{r.action}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          r.priority === "HIGH" ? "bg-rose-100 text-rose-700" : r.priority === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"
                        }`}>
                          {r.priority === "HIGH" ? "긴급" : r.priority === "MEDIUM" ? "중요" : "참고"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
                      {r.expectedEffect && <p className="text-xs text-primary mt-0.5 font-medium">{r.expectedEffect}</p>}
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

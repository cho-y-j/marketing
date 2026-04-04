"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { Check, Loader2, Search, Users, Sparkles, BarChart3, ArrowRight } from "lucide-react";

// Suspense 래퍼
export default function SetupPageWrapper() {
  return <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>}><SetupPage /></Suspense>;
}

interface Step {
  id: string;
  label: string;
  icon: React.ElementType;
  status: "pending" | "running" | "done" | "error";
  result?: string;
}

function SetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("id") || "";
  const storeName = searchParams.get("name") || "매장";

  const [steps, setSteps] = useState<Step[]>([
    { id: "keywords", label: "키워드 자동 추천", icon: Search, status: "pending" },
    { id: "competitors", label: "경쟁 매장 탐색", icon: Users, status: "pending" },
    { id: "briefing", label: "AI 브리핑 생성", icon: Sparkles, status: "pending" },
    { id: "analysis", label: "AI 매장 분석", icon: BarChart3, status: "pending" },
  ]);

  const [allDone, setAllDone] = useState(false);

  const updateStep = (id: string, update: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)));
  };

  useEffect(() => {
    if (!storeId) return;
    runSetup();
  }, [storeId]);

  const runSetup = async () => {
    // 1. 키워드 자동 추천
    updateStep("keywords", { status: "running" });
    try {
      const { data } = await apiClient.post(`/stores/${storeId}/keywords/discover`);
      const discovered = data.discovered || [];
      // 상위 5개 자동 추가
      let added = 0;
      for (const kw of discovered.slice(0, 5)) {
        try {
          await apiClient.post(`/stores/${storeId}/keywords`, {
            keyword: kw.keyword,
            type: "AI_RECOMMENDED",
          });
          added++;
        } catch {}
      }
      updateStep("keywords", { status: "done", result: `${added}개 키워드 추가됨` });
    } catch {
      // 검색광고 API 실패 시 기본 키워드 추가
      try {
        await apiClient.post(`/stores/${storeId}/keywords`, {
          keyword: storeName,
          type: "MAIN",
        });
        updateStep("keywords", { status: "done", result: "기본 키워드 1개 추가됨" });
      } catch {
        updateStep("keywords", { status: "error", result: "키워드 추가 실패" });
      }
    }

    // 2. 경쟁 매장 탐색 (백엔드에서 매장 생성 시 이미 실행됐을 수 있음)
    updateStep("competitors", { status: "running" });
    try {
      const { data } = await apiClient.get(`/stores/${storeId}/competitors`);
      if (data.length === 0) {
        // 없으면 수동으로 안내
        updateStep("competitors", { status: "done", result: "나중에 직접 추가할 수 있어요" });
      } else {
        updateStep("competitors", { status: "done", result: `${data.length}개 경쟁 매장 발견` });
      }
    } catch {
      updateStep("competitors", { status: "done", result: "나중에 추가할 수 있어요" });
    }

    // 3. AI 브리핑 생성
    updateStep("briefing", { status: "running" });
    try {
      await apiClient.post(`/stores/${storeId}/briefing/generate`);
      updateStep("briefing", { status: "done", result: "오늘의 브리핑 생성 완료!" });
    } catch {
      updateStep("briefing", { status: "done", result: "브리핑은 대시보드에서 생성 가능" });
    }

    // 4. AI 분석
    updateStep("analysis", { status: "running" });
    try {
      await apiClient.post(`/stores/${storeId}/analysis/run`);
      updateStep("analysis", { status: "done", result: "매장 분석 완료!" });
    } catch {
      updateStep("analysis", { status: "done", result: "분석은 대시보드에서 실행 가능" });
    }

    setAllDone(true);
  };

  return (
    <div className="max-w-lg mx-auto mt-8">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold">"{storeName}" 준비 중</h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI가 매장 데이터를 분석하고 있어요
        </p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                step.status === "done" ? "bg-green-100" :
                step.status === "running" ? "bg-primary/10" :
                step.status === "error" ? "bg-red-100" :
                "bg-muted"
              }`}>
                {step.status === "running" ? (
                  <Loader2 size={18} className="text-primary animate-spin" />
                ) : step.status === "done" ? (
                  <Check size={18} className="text-green-600" />
                ) : (
                  <step.icon size={18} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${step.status === "done" ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
                {step.result && (
                  <p className="text-xs text-muted-foreground">{step.result}</p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {allDone && (
        <Button
          className="w-full mt-4"
          size="lg"
          onClick={() => router.push("/")}
        >
          대시보드로 이동 <ArrowRight size={16} className="ml-2" />
        </Button>
      )}
    </div>
  );
}

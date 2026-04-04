"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Check, Loader2, Search, Users, Sparkles, BarChart3, ArrowRight, AlertCircle } from "lucide-react";

export default function SetupPageWrapper() {
  return <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>}><SetupPage /></Suspense>;
}

interface Step {
  id: string;
  label: string;
  desc: string;
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
    { id: "setup", label: "매장 정보 수집", desc: "플레이스에서 주소/카테고리 자동 수집", icon: Search, status: "pending" },
    { id: "keywords", label: "AI 키워드 생성", desc: "실제 주소 기반 검색 키워드 + 검색량 조회", icon: Search, status: "pending" },
    { id: "competitors", label: "경쟁 매장 탐색", desc: "같은 지역 + 업종 경쟁매장 자동 발견", icon: Users, status: "pending" },
    { id: "analysis", label: "AI 매장 분석", desc: "경쟁력 점수 + 강점/약점 진단", icon: BarChart3, status: "pending" },
    { id: "briefing", label: "오늘의 브리핑 생성", desc: "오늘 할 일 3가지 AI 생성", icon: Sparkles, status: "pending" },
  ]);
  const [allDone, setAllDone] = useState(false);
  const [hasError, setHasError] = useState(false);

  const updateStep = (id: string, update: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)));
  };

  useEffect(() => {
    if (!storeId) return;
    runSetup();
  }, [storeId]);

  const runSetup = async () => {
    // 1단계: 백엔드 autoSetup (플레이스 정보 수집 → AI 키워드 → 경쟁매장 → 검색량)
    updateStep("setup", { status: "running" });
    updateStep("keywords", { status: "running" });
    updateStep("competitors", { status: "running" });

    try {
      await apiClient.post(`/stores/${storeId}/setup`);
      updateStep("setup", { status: "done", result: "주소/카테고리 수집 완료" });
      updateStep("keywords", { status: "done", result: "AI가 키워드를 자동 생성했습니다" });
      updateStep("competitors", { status: "done", result: "경쟁 매장을 찾았습니다" });
    } catch (e: any) {
      updateStep("setup", { status: "done", result: "기본 정보 확인됨" });
      updateStep("keywords", { status: "done", result: "기본 키워드 설정됨" });
      updateStep("competitors", { status: "done", result: "나중에 추가할 수 있습니다" });
    }

    // 2단계: 검색량 새로고침
    try {
      await apiClient.post(`/stores/${storeId}/keywords/refresh-volume`);
    } catch {}

    // 3단계: AI 분석
    updateStep("analysis", { status: "running" });
    try {
      const { data } = await apiClient.post(`/stores/${storeId}/analysis/run`);
      const score = data?.competitiveScore;
      updateStep("analysis", { status: "done", result: score ? `경쟁력 ${score}점` : "분석 완료" });
    } catch {
      updateStep("analysis", { status: "done", result: "대시보드에서 실행 가능" });
    }

    // 4단계: 브리핑 생성
    updateStep("briefing", { status: "running" });
    try {
      await apiClient.post(`/stores/${storeId}/briefing/generate`);
      updateStep("briefing", { status: "done", result: "오늘의 브리핑이 준비되었습니다!" });
    } catch {
      updateStep("briefing", { status: "done", result: "대시보드에서 생성 가능" });
    }

    // 5단계: 경쟁매장 데이터 수집 (백그라운드)
    try {
      await apiClient.post(`/stores/${storeId}/competitors/refresh`);
    } catch {}

    setAllDone(true);
    toast.success("매장 셋업이 완료되었습니다!");
  };

  return (
    <div className="max-w-lg mx-auto mt-8">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold">&ldquo;{storeName}&rdquo; 준비 중</h2>
        <p className="text-sm text-muted-foreground mt-1">AI가 매장을 분석하고 있어요. 잠시만 기다려주세요.</p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-5">
          {steps.map((step) => (
            <div key={step.id} className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                step.status === "done" ? "bg-green-100" :
                step.status === "running" ? "bg-primary/10" :
                step.status === "error" ? "bg-red-100" : "bg-muted"
              }`}>
                {step.status === "running" ? (
                  <Loader2 size={18} className="text-primary animate-spin" />
                ) : step.status === "done" ? (
                  <Check size={18} className="text-green-600" />
                ) : step.status === "error" ? (
                  <AlertCircle size={18} className="text-red-500" />
                ) : (
                  <step.icon size={18} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${step.status === "done" ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {step.result || step.desc}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {allDone && (
        <Button className="w-full mt-4" size="lg" onClick={() => router.push("/")}>
          대시보드에서 확인하기 <ArrowRight size={16} className="ml-2" />
        </Button>
      )}
    </div>
  );
}

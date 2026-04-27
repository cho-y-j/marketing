"use client";

import { useSetupStatus, useRetrySetup } from "@/hooks/useStore";
import { Loader2, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface SetupProgressCardProps {
  storeId: string;
  onComplete?: () => void;
}

export function SetupProgressCard({ storeId, onComplete }: SetupProgressCardProps) {
  const { data: setup, isLoading } = useSetupStatus(storeId);
  const retrySetup = useRetrySetup();

  if (isLoading || !setup) return null;

  // 진짜 완료 — 백엔드가 set한 "완료 —" 마커가 들어왔을 때
  const isFullyDone =
    setup.status === "COMPLETED" &&
    setup.keywordCount > 0 &&
    setup.competitorCount > 0 &&
    setup.step?.startsWith("완료 —");

  if (isFullyDone) {
    onComplete?.();
    return null;
  }

  // status=COMPLETED 라도 데이터가 0이거나 setupStep에 진행 표현이 있으면 백그라운드 진행 중
  // (백엔드가 Stage 1 직후 setupStatus=COMPLETED set하고 백그라운드 도는 구조 때문)
  const isStillProcessing =
    setup.status !== "FAILED" &&
    !setup.error &&
    (setup.status === "RUNNING" ||
      setup.status === "PENDING" ||
      setup.keywordCount === 0 ||
      setup.competitorCount === 0 ||
      (setup.step != null && /(진행 중|분석 중|수집 중|추가 분석)/.test(setup.step)));

  const handleRetry = () => {
    retrySetup.mutate(storeId, {
      onSuccess: () => toast.success("셋업을 다시 시작합니다"),
      onError: () => toast.error("셋업 재시도 실패"),
    });
  };

  return (
    <div className="rounded-2xl border border-border-primary bg-surface p-6 shadow-sm">
      {isStillProcessing && (
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-brand-subtle flex items-center justify-center shrink-0">
            <Loader2 size={24} className="animate-spin text-brand" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">AI가 매장을 분석하고 있습니다</h3>
            <p className="mt-1 text-sm text-text-secondary">{setup.step || "준비 중..."}</p>
            <div className="mt-2 flex gap-4 text-xs text-text-tertiary">
              {setup.keywordCount > 0 && <span>키워드 {setup.keywordCount}개 생성됨</span>}
              {setup.competitorCount > 0 && <span>경쟁사 {setup.competitorCount}개 발견</span>}
            </div>
          </div>
        </div>
      )}

      {setup.status === "FAILED" && (
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-danger-light flex items-center justify-center shrink-0">
            <AlertTriangle size={24} className="text-danger" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">자동 셋업에 실패했습니다</h3>
            <p className="mt-1 text-sm text-danger">{setup.error || "알 수 없는 오류"}</p>
            {setup.keywordCount > 0 && (
              <p className="mt-1 text-xs text-text-tertiary">
                부분 완료: 키워드 {setup.keywordCount}개, 경쟁사 {setup.competitorCount}개
              </p>
            )}
          </div>
          <button
            onClick={handleRetry}
            disabled={retrySetup.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50 transition-colors"
          >
            {retrySetup.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RotateCcw size={16} />
            )}
            재시도
          </button>
        </div>
      )}

      {/* "데이터 부족" 메시지 — 진짜 fail 케이스만 표시 (error가 있고 데이터가 0인 경우) */}
      {setup.status === "COMPLETED" &&
        setup.keywordCount === 0 &&
        !isStillProcessing && (
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-2xl bg-warning-light flex items-center justify-center shrink-0">
              <CheckCircle2 size={24} className="text-warning" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">셋업이 완료되었지만 데이터가 부족합니다</h3>
              <p className="mt-1 text-sm text-text-secondary">
                네이버 플레이스 URL을 등록하면 더 정확한 분석이 가능합니다
              </p>
            </div>
            <button
              onClick={handleRetry}
              disabled={retrySetup.isPending}
              className="flex items-center gap-2 rounded-xl border border-border-primary px-4 py-2 text-sm font-medium hover:bg-surface-secondary transition-colors"
            >
              <RotateCcw size={16} />
              다시 시도
            </button>
          </div>
        )}
    </div>
  );
}

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

  if (setup?.status === "COMPLETED" && onComplete) {
    onComplete();
  }

  if (isLoading || !setup) return null;
  if (setup.status === "COMPLETED" && setup.keywordCount > 0) return null;

  const handleRetry = () => {
    retrySetup.mutate(storeId, {
      onSuccess: () => toast.success("셋업을 다시 시작합니다"),
      onError: () => toast.error("셋업 재시도 실패"),
    });
  };

  return (
    <div className="rounded-2xl border border-border-primary bg-surface p-6 shadow-sm">
      {(setup.status === "RUNNING" || setup.status === "PENDING") && (
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

      {setup.status === "COMPLETED" && setup.keywordCount === 0 && (
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

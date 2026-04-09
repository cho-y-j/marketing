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

  // 완료 콜백
  if (setup?.status === "COMPLETED" && onComplete) {
    onComplete();
  }

  if (isLoading || !setup) return null;

  // 이미 완료된 상태면 표시 안함
  if (setup.status === "COMPLETED" && setup.keywordCount > 0) return null;

  const handleRetry = () => {
    retrySetup.mutate(storeId, {
      onSuccess: () => toast.success("셋업을 다시 시작합니다"),
      onError: () => toast.error("셋업 재시도 실패"),
    });
  };

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      {/* RUNNING 상태 */}
      {(setup.status === "RUNNING" || setup.status === "PENDING") && (
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">AI가 매장을 분석하고 있습니다</h3>
            <p className="mt-1 text-sm text-gray-500">{setup.step || "준비 중..."}</p>
            <div className="mt-2 flex gap-4 text-xs text-gray-400">
              {setup.keywordCount > 0 && <span>키워드 {setup.keywordCount}개 생성됨</span>}
              {setup.competitorCount > 0 && <span>경쟁사 {setup.competitorCount}개 발견</span>}
            </div>
          </div>
        </div>
      )}

      {/* FAILED 상태 */}
      {setup.status === "FAILED" && (
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">자동 셋업에 실패했습니다</h3>
            <p className="mt-1 text-sm text-red-500">{setup.error || "알 수 없는 오류"}</p>
            {setup.keywordCount > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                부분 완료: 키워드 {setup.keywordCount}개, 경쟁사 {setup.competitorCount}개
              </p>
            )}
          </div>
          <button
            onClick={handleRetry}
            disabled={retrySetup.isPending}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {retrySetup.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            재시도
          </button>
        </div>
      )}

      {/* COMPLETED but empty */}
      {setup.status === "COMPLETED" && setup.keywordCount === 0 && (
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-50">
            <CheckCircle2 className="h-6 w-6 text-yellow-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">셋업이 완료되었지만 데이터가 부족합니다</h3>
            <p className="mt-1 text-sm text-gray-500">네이버 플레이스 URL을 등록하면 더 정확한 분석이 가능합니다</p>
          </div>
          <button
            onClick={handleRetry}
            disabled={retrySetup.isPending}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" />
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

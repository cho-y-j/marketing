"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { useStores, useDeleteStore } from "@/hooks/useStore";
import { useActiveStore } from "@/hooks/useActiveStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getScoreLevel } from "@/lib/design-system";
import { Store, Plus, MapPin, Tag, ArrowRight, Check, Trash2, Loader2 } from "lucide-react";

export default function StoresPage() {
  const { data: stores, isLoading } = useStores();
  const { activeStoreId, setActiveStoreId } = useActiveStore();
  const router = useRouter();
  const deleteStore = useDeleteStore();

  const handleSelect = (storeId: string) => {
    setActiveStoreId(storeId);
    toast.success("매장이 전환되었습니다");
    router.push("/");
  };

  const handleDelete = (storeId: string, storeName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 (매장 전환) 방지
    const confirmMsg = `"${storeName}" 매장을 삭제하시겠습니까?\n\n관련된 키워드·경쟁사·분석 데이터가 모두 함께 삭제되며 복구할 수 없습니다.`;
    if (!window.confirm(confirmMsg)) return;

    deleteStore.mutate(storeId, {
      onSuccess: () => {
        toast.success(`"${storeName}" 매장이 삭제되었습니다`);
        // 활성 매장이 삭제된 경우 선택 해제
        if (activeStoreId === storeId) setActiveStoreId(null);
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.message || "삭제 실패 — 잠시 후 다시 시도해주세요");
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-48 rounded-xl" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const storeList = stores ?? [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            내 매장 관리
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            {storeList.length}개 매장
          </p>
        </div>
        <Button
          onClick={() => router.push("/stores/new")}
          className="rounded-xl bg-brand hover:bg-brand-dark"
        >
          <Plus size={14} className="mr-1.5" /> 매장 추가
        </Button>
      </div>

      {storeList.length === 0 ? (
        <div className="rounded-2xl border border-border-primary bg-surface shadow-sm">
          <EmptyState
            icon={Store}
            title="등록된 매장이 없습니다"
            description="매장을 등록하면 AI가 자동으로 분석을 시작합니다"
            ctaLabel="첫 매장 등록하기"
            onCta={() => router.push("/stores/new")}
            className="py-16"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {storeList.map((store: any) => {
            const score = store.competitiveScore ?? 0;
            const isActive = store.id === activeStoreId;
            const sl = getScoreLevel(score);

            return (
              <div
                key={store.id}
                onClick={() => handleSelect(store.id)}
                className={`cursor-pointer rounded-2xl border bg-surface shadow-sm p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  isActive
                    ? "border-brand/30 ring-1 ring-brand/10"
                    : "border-border-primary"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`size-14 rounded-2xl border-2 flex items-center justify-center shrink-0 ${
                        score > 0
                          ? sl.text === "text-score-good"
                            ? "border-score-good"
                            : sl.text === "text-score-mid"
                              ? "border-score-mid"
                              : "border-score-bad"
                          : "border-border-primary"
                      }`}
                    >
                      <span
                        className={`text-lg font-black ${score > 0 ? sl.text : "text-text-tertiary"}`}
                      >
                        {score || "-"}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base truncate">
                          {store.name}
                        </h3>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-subtle text-brand font-semibold flex items-center gap-0.5">
                            <Check size={10} /> 활성
                          </span>
                        )}
                      </div>
                      {(store.address || store.district) && (
                        <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1 truncate">
                          <MapPin size={10} className="shrink-0" />
                          {store.address || store.district}
                        </p>
                      )}
                      {store.category && (
                        <div className="flex gap-1.5 mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-subtle text-brand font-medium flex items-center gap-0.5">
                            <Tag size={8} /> {store.category}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={`${store.name} 삭제`}
                      onClick={(e) => handleDelete(store.id, store.name, e)}
                      disabled={deleteStore.isPending}
                      className="size-9 min-h-[36px] flex items-center justify-center rounded-lg text-text-tertiary hover:text-score-bad hover:bg-score-bad/10 transition-colors disabled:opacity-50"
                    >
                      {deleteStore.isPending && deleteStore.variables === store.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                    <ArrowRight size={16} className="text-text-tertiary" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

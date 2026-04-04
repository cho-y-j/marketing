"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStores } from "@/hooks/useStore";
import { useActiveStore } from "@/hooks/useActiveStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, Plus, Trophy, MapPin, Tag, ArrowRight, Check } from "lucide-react";

export default function StoresPage() {
  const { data: stores, isLoading } = useStores();
  const { activeStoreId, setActiveStoreId } = useActiveStore();
  const router = useRouter();

  const handleSelect = (storeId: string) => {
    setActiveStoreId(storeId);
    toast.success("매장이 전환되었습니다");
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    );
  }

  const storeList = stores ?? [];

  return (
    <div className="space-y-5 md:space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">내 매장 관리</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{storeList.length}개 매장</p>
        </div>
        <Button onClick={() => router.push("/stores/new")} className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-md">
          <Plus size={14} className="mr-1.5" /> 매장 추가
        </Button>
      </div>

      {storeList.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center mx-auto mb-5">
              <Store size={32} className="text-violet-500" />
            </div>
            <p className="text-lg font-semibold mb-1">등록된 매장이 없습니다</p>
            <p className="text-sm text-muted-foreground mb-5">매장을 등록하면 AI가 자동으로 분석을 시작합니다</p>
            <Button onClick={() => router.push("/stores/new")} className="rounded-xl px-6">첫 매장 등록하기</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {storeList.map((store: any) => {
            const score = store.competitiveScore;
            const isActive = store.id === activeStoreId;
            const scoreColor = score >= 71 ? "text-emerald-500" : score >= 41 ? "text-amber-500" : score > 0 ? "text-rose-500" : "text-muted-foreground";
            const scoreRing = score >= 71 ? "from-emerald-400 to-emerald-600" : score >= 41 ? "from-amber-400 to-amber-600" : score > 0 ? "from-rose-400 to-rose-600" : "from-gray-300 to-gray-400";

            return (
              <Card
                key={store.id}
                className={`cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5 active:scale-[0.99] overflow-hidden ${
                  isActive ? "border-primary/30 shadow-md" : ""
                }`}
                onClick={() => handleSelect(store.id)}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      {/* 점수 원형 */}
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${scoreRing} p-0.5 shrink-0`}>
                        <div className="w-full h-full rounded-[14px] bg-white flex items-center justify-center">
                          <span className={`text-lg font-extrabold ${scoreColor}`}>{score || "-"}</span>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base truncate">{store.name}</h3>
                          {isActive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold flex items-center gap-0.5">
                              <Check size={10} /> 활성
                            </span>
                          )}
                        </div>
                        {(store.address || store.district) && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                            <MapPin size={10} className="shrink-0" />
                            {store.address || store.district}
                          </p>
                        )}
                        {store.category && (
                          <div className="flex gap-1.5 mt-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium flex items-center gap-0.5">
                              <Tag size={8} /> {store.category}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStores } from "@/hooks/useStore";
import { useActiveStore } from "@/hooks/useActiveStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, Plus, Trophy, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";

export default function StoresPage() {
  const { data: stores, isLoading } = useStores();
  const { setActiveStoreId } = useActiveStore();
  const router = useRouter();

  const handleSelect = (storeId: string) => {
    setActiveStoreId(storeId);
    toast.success("매장이 전환되었습니다");
    router.push("/");
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-12 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }

  const storeList = stores ?? [];

  return (
    <div className="space-y-4 md:space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">내 매장 관리</h2>
          <p className="text-sm text-muted-foreground">{storeList.length}개 매장</p>
        </div>
        <Button onClick={() => router.push("/stores/new")}>
          <Plus size={14} className="mr-1" /> 매장 추가
        </Button>
      </div>

      {storeList.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Store size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">등록된 매장이 없습니다</p>
            <Button onClick={() => router.push("/stores/new")}>첫 매장 등록하기</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {storeList.map((store: any) => {
            const score = store.competitiveScore;
            const scoreColor = score >= 71 ? "text-green-500" : score >= 41 ? "text-yellow-500" : score > 0 ? "text-red-500" : "text-muted-foreground";
            return (
              <Card
                key={store.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleSelect(store.id)}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* 점수 게이지 */}
                      <div className="w-14 h-14 rounded-full border-4 border-muted flex items-center justify-center shrink-0" style={{
                        borderColor: score >= 71 ? "#22c55e" : score >= 41 ? "#eab308" : score > 0 ? "#ef4444" : undefined,
                      }}>
                        <span className={`text-lg font-bold ${scoreColor}`}>{score || "-"}</span>
                      </div>

                      <div>
                        <h3 className="font-semibold">{store.name}</h3>
                        <p className="text-xs text-muted-foreground">{store.address || store.district || "주소 미등록"}</p>
                        <div className="flex gap-2 mt-1">
                          {store.category && <Badge variant="outline" className="text-[10px]">{store.category}</Badge>}
                        </div>
                      </div>
                    </div>

                    <ArrowRight size={16} className="text-muted-foreground" />
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

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Info, DollarSign, Plus, X, Loader2 } from "lucide-react";

type PriceItem = {
  itemName: string;
  unit: string;
  current: number | null;
  previousWeek: number | null;
  previousMonth: number | null;
  weeklyChange: number | null;
  weeklyChangeAmount: number | null;
  monthlyChange: number | null;
  monthlyChangeAmount: number | null;
  lastUpdated: string | null;
};

type Alert = {
  id: string;
  itemName: string;
  alertType: string;
  message: string;
  currentPrice: number;
  previousPrice: number;
  changeRate: number;
  createdAt: string;
};

export default function IngredientsPage() {
  const { storeId } = useCurrentStoreId();
  const qc = useQueryClient();
  const [newIngredient, setNewIngredient] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const { data, isLoading } = useQuery<{ items: PriceItem[]; alerts: Alert[] }>({
    queryKey: ["ingredient-prices", storeId],
    queryFn: () =>
      apiClient.get(`/stores/${storeId}/ingredients/prices`).then((r) => r.data),
    enabled: !!storeId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ingredient-prices", storeId] });

  const addIngredient = async (name: string) => {
    try {
      await apiClient.post(`/stores/${storeId}/ingredients`, { name });
      toast.success(`"${name}" 추가됨`);
      setNewIngredient("");
      setSearchResults([]);
      invalidate();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "추가 실패");
    }
  };

  const removeIngredient = async (name: string) => {
    if (!confirm(`"${name}" 삭제하시겠습니까?`)) return;
    try {
      await apiClient.delete(`/stores/${storeId}/ingredients/${encodeURIComponent(name)}`);
      toast.success(`"${name}" 삭제됨`);
      invalidate();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "삭제 실패");
    }
  };

  const handleSearch = async (q: string) => {
    setNewIngredient(q);
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    try {
      const { data } = await apiClient.get(`/stores/${storeId}/ingredients/search`, { params: { q } });
      setSearchResults(data.slice(0, 8));
    } catch {
      setSearchResults([]);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">원가 관리</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            KAMIS 농수산물유통정보 · 매일 자동 갱신 · 주재료 {data?.items?.length ?? 0}개 추적
          </p>
        </div>
        {data?.items?.[0]?.lastUpdated && (
          <Badge variant="outline" className="text-xs">
            {data.items[0].lastUpdated} 기준
          </Badge>
        )}
      </div>

      {/* 재료 추가 */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Plus size={14} className="text-primary" />
            <span className="font-semibold text-sm">재료 직접 추가</span>
          </div>
          <p className="text-xs text-muted-foreground">
            KAMIS 등록 품목 이름으로 추가 (예: 고추장, 참기름, 대파, 배추). 입력하면 자동 제안됩니다.
          </p>
          <div className="flex gap-2 relative">
            <div className="flex-1 relative">
              <Input
                placeholder="재료명 (예: 고추장, 참기름)"
                value={newIngredient}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newIngredient.trim()) {
                    addIngredient(newIngredient.trim());
                  }
                }}
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                  {searchResults.map((s) => (
                    <button
                      key={s}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-b-0"
                      onClick={() => addIngredient(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              onClick={() => newIngredient.trim() && addIngredient(newIngredient.trim())}
              disabled={!newIngredient.trim()}
            >
              추가
            </Button>
          </div>
        </CardContent>
      </Card>

      {(!data || data.items.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <DollarSign size={28} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">추적 대상 재료가 없습니다</p>
            <p className="text-xs mt-1">위에서 재료를 직접 추가해주세요</p>
          </CardContent>
        </Card>
      )}

      {/* 급등/변동 알림 */}
      {data && data.alerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <AlertTriangle size={14} className="text-amber-600" />
              가격 변동 알림 ({data.alerts.length}건)
            </div>
            <div className="space-y-1.5">
              {data.alerts.map((a) => (
                <div
                  key={a.id}
                  className={`text-xs px-3 py-2 rounded-md border flex items-start gap-2 ${
                    a.alertType === "MONTHLY_20"
                      ? "bg-red-50 border-red-200 text-red-900"
                      : "bg-white border-amber-200 text-amber-900"
                  }`}
                >
                  {a.alertType === "MONTHLY_20" ? (
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  ) : (
                    <Info size={13} className="shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{a.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 재료 목록 */}
      {data && data.items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="min-w-[780px]">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_90px_50px] gap-2 px-4 py-2.5 border-b bg-muted/30 text-[11px] font-semibold text-muted-foreground">
                  <div>재료</div>
                  <div className="text-right">현재 가격</div>
                  <div className="text-right">전주 대비</div>
                  <div className="text-right">전월 대비</div>
                  <div className="text-center">상태</div>
                  <div></div>
                </div>
                {data.items.map((item) => (
                  <PriceRow
                    key={item.itemName}
                    item={item}
                    onRemove={() => removeIngredient(item.itemName)}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 정보 */}
      <Card className="border-sky-200 bg-sky-50/30">
        <CardContent className="p-4 text-xs space-y-1.5">
          <div className="font-semibold text-sky-900">알림 기준</div>
          <div className="text-sky-800/90 space-y-0.5">
            <div>• 전주 대비 <strong>+10% 이상</strong> 상승 시 일반 알림</div>
            <div>• 전월 대비 <strong>+20% 이상</strong> 상승 시 강한 알림 (가격 재검토 권장)</div>
            <div>• 하락 시 알림 없음 (원가 절감 기회로 가정)</div>
            <div className="pt-1 text-sky-700/70">
              주재료 변경은 설정 &gt; 매장 관리에서 가능 (예정)
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PriceRow({ item, onRemove }: { item: PriceItem; onRemove?: () => void }) {
  const hasData = item.current != null;
  const weeklyClr =
    item.weeklyChange == null
      ? "text-muted-foreground"
      : item.weeklyChange >= 10
        ? "text-red-700 font-bold"
        : item.weeklyChange > 0
          ? "text-red-600"
          : item.weeklyChange < 0
            ? "text-green-600"
            : "text-muted-foreground";
  const monthlyClr =
    item.monthlyChange == null
      ? "text-muted-foreground"
      : item.monthlyChange >= 20
        ? "text-red-700 font-bold"
        : item.monthlyChange > 0
          ? "text-red-600"
          : item.monthlyChange < 0
            ? "text-green-600"
            : "text-muted-foreground";

  const status =
    (item.monthlyChange ?? 0) >= 20
      ? { label: "급등", color: "bg-red-100 text-red-700 border-red-300" }
      : (item.weeklyChange ?? 0) >= 10
        ? { label: "상승", color: "bg-amber-100 text-amber-700 border-amber-300" }
        : (item.weeklyChange ?? 0) < 0
          ? { label: "하락", color: "bg-green-50 text-green-700 border-green-200" }
          : { label: "안정", color: "bg-sky-50 text-sky-700 border-sky-200" };

  const fmtRate = (v: number | null) =>
    v == null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  const fmtAmt = (v: number | null) =>
    v == null ? null : v > 0 ? `+${v.toLocaleString()}원` : `${v.toLocaleString()}원`;

  return (
    <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_90px_50px] gap-2 px-4 py-3 border-b last:border-b-0 text-sm items-center hover:bg-muted/10 transition-colors">
      <div>
        <div className="font-semibold flex items-center gap-1.5">
          {item.itemName}
          {!hasData && (
            <Badge variant="outline" className="text-[9px] bg-gray-100 text-gray-600 border-gray-300">
              KAMIS 미등록
            </Badge>
          )}
        </div>
        {!hasData && (
          <div
            className="text-[10px] text-muted-foreground mt-0.5"
            title="KAMIS 공개 가격 데이터에 없는 품목입니다. 대체 품목을 사용하거나 삭제 후 다른 재료를 추가하세요."
          >
            실가격 추적 불가 — 대체 품목 등록 권장
          </div>
        )}
      </div>
      <div className="text-right">
        {hasData ? (
          <>
            <div className="font-mono font-bold text-base">{item.current!.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">원/{item.unit}</div>
          </>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </div>
      <div className={`text-right ${weeklyClr}`}>
        <div className="font-mono font-semibold">{fmtRate(item.weeklyChange)}</div>
        {fmtAmt(item.weeklyChangeAmount) && (
          <div className="text-[10px]">{fmtAmt(item.weeklyChangeAmount)}</div>
        )}
      </div>
      <div className={`text-right ${monthlyClr}`}>
        <div className="font-mono font-semibold">{fmtRate(item.monthlyChange)}</div>
        {fmtAmt(item.monthlyChangeAmount) && (
          <div className="text-[10px]">{fmtAmt(item.monthlyChangeAmount)}</div>
        )}
      </div>
      <div className="flex justify-center">
        <Badge variant="outline" className={`text-[10px] ${status.color}`}>
          {item.weeklyChange != null && item.weeklyChange > 0 ? <TrendingUp size={10} className="mr-0.5" /> : null}
          {item.weeklyChange != null && item.weeklyChange < 0 ? <TrendingDown size={10} className="mr-0.5" /> : null}
          {status.label}
        </Badge>
      </div>
      <div className="flex justify-center">
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-muted-foreground/40 hover:text-red-500 transition-colors"
            title="이 재료 삭제"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

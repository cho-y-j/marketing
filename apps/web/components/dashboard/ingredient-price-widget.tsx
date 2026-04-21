"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Info } from "lucide-react";

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

export function IngredientPriceWidget({ storeId }: { storeId?: string }) {
  const { data, isLoading } = useQuery<{ items: PriceItem[]; alerts: Alert[] }>({
    queryKey: ["ingredient-prices", storeId],
    queryFn: () =>
      apiClient.get(`/stores/${storeId}/ingredients/prices`).then((r) => r.data),
    enabled: !!storeId,
  });

  if (isLoading || !data) return null;
  if (data.items.length === 0) return null;

  return (
    <Card className="border-orange-200 bg-orange-50/30">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">💰</span>
            <h3 className="text-sm font-bold">주재료 가격 (KAMIS)</h3>
          </div>
          {data.items[0]?.lastUpdated && (
            <span className="text-[10px] text-muted-foreground">{data.items[0].lastUpdated} 기준</span>
          )}
        </div>

        {/* 알림 */}
        {data.alerts.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {data.alerts.slice(0, 2).map((a) => (
              <div
                key={a.id}
                className={`text-xs px-3 py-2 rounded-md border flex items-start gap-2 ${
                  a.alertType === "MONTHLY_20"
                    ? "bg-red-50 border-red-200 text-red-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
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
        )}

        {/* 재료 리스트 */}
        <div className="space-y-2">
          {data.items.map((item) => (
            <PriceRow key={item.itemName} item={item} />
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground mt-3 pt-3 border-t">
          KAMIS 농수산물유통정보 · 매일 자동 갱신 · 전주/전월 대비 변동률
        </p>
      </CardContent>
    </Card>
  );
}

function PriceRow({ item }: { item: PriceItem }) {
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

  return (
    <div className="bg-white rounded-md p-2.5 border border-orange-100 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold text-sm">{item.itemName}</span>
          {!hasData && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 bg-muted text-muted-foreground">
              수집 대기
            </Badge>
          )}
        </div>
        {hasData && (
          <div className="text-lg font-black font-mono">
            {item.current!.toLocaleString()}
            <span className="text-xs font-normal text-muted-foreground ml-1">원/{item.unit}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-0.5 text-xs shrink-0">
        {item.weeklyChange != null && (
          <div className={`inline-flex items-center gap-0.5 ${weeklyClr}`}>
            {item.weeklyChange > 0 ? (
              <TrendingUp size={11} />
            ) : item.weeklyChange < 0 ? (
              <TrendingDown size={11} />
            ) : (
              <Minus size={11} />
            )}
            <span className="font-mono">
              {item.weeklyChange > 0 ? "+" : ""}
              {item.weeklyChange}%
            </span>
            {item.weeklyChangeAmount != null && item.weeklyChangeAmount !== 0 && (
              <span className="text-[10px] text-muted-foreground ml-1">
                ({item.weeklyChangeAmount > 0 ? "+" : ""}
                {item.weeklyChangeAmount.toLocaleString()}원)
              </span>
            )}
            <span className="text-[9px] text-muted-foreground ml-1">전주</span>
          </div>
        )}
        {item.monthlyChange != null && (
          <div className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
            전월 {item.monthlyChange > 0 ? "+" : ""}
            {item.monthlyChange}%
          </div>
        )}
      </div>
    </div>
  );
}

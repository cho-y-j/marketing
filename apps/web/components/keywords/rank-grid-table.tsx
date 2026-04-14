"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRankHistory } from "@/hooks/useRankHistory";

function getRankColor(rank: number | null | undefined): string {
  if (rank == null) return "text-muted-foreground";
  if (rank <= 5) return "text-blue-600 font-black";
  if (rank <= 10) return "text-blue-500 font-bold";
  if (rank <= 30) return "text-red-500 font-bold";
  if (rank <= 50) return "text-foreground font-semibold";
  return "text-muted-foreground";
}

function getRankBg(rank: number | null | undefined): string {
  if (rank == null) return "";
  if (rank <= 5) return "bg-blue-50";
  if (rank <= 10) return "bg-blue-50/50";
  if (rank <= 30) return "bg-red-50/50";
  return "";
}

export function RankGridTable({ storeId }: { storeId: string }) {
  const [days, setDays] = useState(14);
  const { data: rankData, isLoading } = useRankHistory(storeId, days);

  if (isLoading || !rankData || rankData.length === 0) return null;

  // rankData: [{date, keyword1: rank, keyword2: rank, ...}, ...]
  // 키워드 목록 추출
  const allKeywords = new Set<string>();
  for (const row of rankData) {
    for (const key of Object.keys(row)) {
      if (key !== "date") allKeywords.add(key);
    }
  }
  const keywords = Array.from(allKeywords);

  // 날짜 역순 (최신이 먼저)
  const sorted = [...rankData].reverse();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-muted-foreground">일별 순위 추이</h3>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              className="text-xs h-7 px-2.5"
              onClick={() => setDays(d)}
            >
              {d}일
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap sticky left-0 bg-muted/50 z-10">
                  날짜
                </th>
                {keywords.map((kw) => (
                  <th key={kw} className="text-center px-2 py-2 font-medium whitespace-nowrap min-w-[80px]">
                    {kw}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row: any, i: number) => {
                const date = row.date;
                const d = new Date(date);
                const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
                const dayOfWeek = dayNames[d.getDay()];
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                return (
                  <tr key={i} className={`border-t ${isWeekend ? "bg-muted/20" : "hover:bg-muted/30"}`}>
                    <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white z-10 border-r">
                      <span className="font-medium">
                        {date.slice(5)}
                      </span>
                      <span className={`ml-1 text-[10px] ${isWeekend ? "text-red-400" : "text-muted-foreground"}`}>
                        ({dayOfWeek})
                      </span>
                    </td>
                    {keywords.map((kw) => {
                      const rank = row[kw];
                      // 이전 날과 비교
                      const nextRow = sorted[i + 1]; // sorted는 역순이므로 i+1이 이전 날
                      const prevRank = nextRow?.[kw];
                      const diff = prevRank != null && rank != null ? prevRank - rank : null;

                      return (
                        <td key={kw} className={`text-center px-2 py-2 ${getRankBg(rank)}`}>
                          <span className={getRankColor(rank)}>
                            {rank != null ? `${rank}위` : "-"}
                          </span>
                          {diff != null && diff !== 0 && (
                            <span className={`block text-[10px] ${diff > 0 ? "text-green-500" : "text-red-500"}`}>
                              {diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

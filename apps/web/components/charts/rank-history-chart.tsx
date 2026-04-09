"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartWrapper } from "./chart-wrapper";

interface RankDataPoint {
  date: string;
  [keyword: string]: string | number | null;
}

interface RankHistoryChartProps {
  data: RankDataPoint[];
  keywords: string[];
  isLoading?: boolean;
  onPeriodChange?: (days: number) => void;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function RankHistoryChart({
  data,
  keywords,
  isLoading,
  onPeriodChange,
}: RankHistoryChartProps) {
  return (
    <ChartWrapper
      title="키워드 순위 변동"
      isLoading={isLoading}
      isEmpty={!data || data.length === 0}
      emptyMessage="키워드를 추가하고 순위 체크를 실행해보세요"
      isInsufficient={data && data.length === 1}
      insufficientMessage="순위 데이터 1회 수집됨 — 내일 비교 데이터가 추가됩니다"
      onPeriodChange={onPeriodChange}
    >
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            reversed
            domain={[1, "auto"]}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            label={{ value: "순위", angle: -90, position: "insideLeft", offset: 10, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: 12,
            }}
            formatter={(value: any, name: any) => [
              value ? `${value}위` : "순위 밖",
              name,
            ]}
          />
          {keywords.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {keywords.map((kw, i) => (
            <Line
              key={kw}
              type="monotone"
              dataKey={kw}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
              name={kw}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

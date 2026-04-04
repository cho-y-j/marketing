"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartWrapper } from "./chart-wrapper";

interface TrendDataPoint {
  date: string;
  volume: number;
}

interface KeywordTrendChartProps {
  data: TrendDataPoint[];
  keyword: string;
  isLoading?: boolean;
  onPeriodChange?: (days: number) => void;
}

export function KeywordTrendChart({
  data,
  keyword,
  isLoading,
  onPeriodChange,
}: KeywordTrendChartProps) {
  return (
    <ChartWrapper
      title={`"${keyword}" 검색량 추세`}
      isLoading={isLoading}
      isEmpty={!data || data.length === 0}
      onPeriodChange={onPeriodChange}
    >
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: 12,
            }}
            formatter={(value: any) => [`${Number(value).toLocaleString()}회`, "검색량"]}
          />
          <Area
            type="monotone"
            dataKey="volume"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            fill="url(#trendGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

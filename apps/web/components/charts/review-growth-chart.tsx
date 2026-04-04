"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartWrapper } from "./chart-wrapper";

interface ReviewDataPoint {
  date: string;
  receipt: number;
  blog: number;
}

interface ReviewGrowthChartProps {
  data: ReviewDataPoint[];
  isLoading?: boolean;
  onPeriodChange?: (days: number) => void;
}

export function ReviewGrowthChart({
  data,
  isLoading,
  onPeriodChange,
}: ReviewGrowthChartProps) {
  return (
    <ChartWrapper
      title="리뷰 증감"
      isLoading={isLoading}
      isEmpty={!data || data.length === 0}
      onPeriodChange={onPeriodChange}
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
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
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="receipt" name="영수증 리뷰" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="blog" name="블로그 리뷰" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

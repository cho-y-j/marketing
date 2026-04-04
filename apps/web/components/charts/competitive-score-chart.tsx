"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChartWrapper } from "./chart-wrapper";

interface ScoreDataPoint {
  date: string;
  score: number;
}

interface CompetitiveScoreChartProps {
  data: ScoreDataPoint[];
  isLoading?: boolean;
  onPeriodChange?: (days: number) => void;
}

export function CompetitiveScoreChart({
  data,
  isLoading,
  onPeriodChange,
}: CompetitiveScoreChartProps) {
  return (
    <ChartWrapper
      title="경쟁력 점수 변동"
      isLoading={isLoading}
      isEmpty={!data || data.length === 0}
      onPeriodChange={onPeriodChange}
    >
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: 12,
            }}
            formatter={(value: any) => [`${value}점`, "경쟁력"]}
          />
          <ReferenceLine y={70} stroke="hsl(var(--chart-2))" strokeDasharray="3 3" label={{ value: "양호", fontSize: 10 }} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "hsl(var(--chart-1))" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

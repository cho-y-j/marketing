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
import { CHART_COLORS } from "@/lib/design-system";

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
      emptyMessage="AI 분석을 실행하면 점수 변동 추이가 표시됩니다"
      isInsufficient={data && data.length === 1}
      insufficientMessage="경쟁력 점수 1회 측정됨 — 다음 분석 후 추이 차트가 그려집니다"
      onPeriodChange={onPeriodChange}
    >
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border-secondary)"
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-primary)",
              borderRadius: "12px",
              fontSize: 12,
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
            formatter={(value: any) => [`${value}점`, "경쟁력"]}
          />
          <ReferenceLine
            y={70}
            stroke={CHART_COLORS[1]}
            strokeDasharray="3 3"
            label={{ value: "양호", fontSize: 10 }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={CHART_COLORS[0]}
            strokeWidth={2.5}
            dot={{ r: 3, fill: CHART_COLORS[0] }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

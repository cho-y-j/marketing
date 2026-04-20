"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { ChartWrapper } from "./chart-wrapper";
import { CHART_COLORS } from "@/lib/design-system";

interface Series {
  key: string;
  label: string;
  isMine?: boolean;
}

interface CompetitorTrendChartProps {
  title: string;
  data: Array<{ date: string; [key: string]: number | string | null }>;
  series: Series[];
  isLoading?: boolean;
}

export function CompetitorTrendChart({
  title,
  data,
  series,
  isLoading,
}: CompetitorTrendChartProps) {
  const isInsufficient = data && data.length === 1;
  return (
    <ChartWrapper
      title={title}
      isLoading={isLoading}
      isEmpty={!data || data.length === 0}
      emptyMessage="스냅샷이 아직 없습니다 — 내일 01:00 이후 첫 데이터 생성"
      isInsufficient={isInsufficient}
      insufficientMessage="1일치만 수집 — 내일부터 추이선이 그려집니다"
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-secondary)" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => (typeof v === "string" ? v.slice(5) : v)}
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            domain={["auto", "auto"]}
            tickFormatter={(v) => (typeof v === "number" ? v.toLocaleString() : v)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-primary)",
              borderRadius: 10,
              fontSize: 12,
            }}
            formatter={(value: any, name: any) => [
              typeof value === "number" ? value.toLocaleString() : value,
              name,
            ]}
          />
          {series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          )}
          {series.map((s, i) => {
            const color = s.isMine
              ? "var(--color-primary, #2563eb)"
              : CHART_COLORS[i % CHART_COLORS.length];
            return (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={s.isMine ? 3 : 2}
                dot={{ r: s.isMine ? 4 : 2.5, fill: color }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

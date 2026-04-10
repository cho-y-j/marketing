"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { ChartWrapper } from "./chart-wrapper";
import { CHART_COLORS } from "@/lib/design-system";

interface RadarDataPoint {
  metric: string;
  myStore: number;
  competitor: number;
}

interface CompetitorRadarChartProps {
  data: RadarDataPoint[];
  myStoreName: string;
  competitorName: string;
  isLoading?: boolean;
}

export function CompetitorRadarChart({
  data,
  myStoreName,
  competitorName,
  isLoading,
}: CompetitorRadarChartProps) {
  return (
    <ChartWrapper
      title="경쟁 매장 비교"
      isLoading={isLoading}
      isEmpty={!data || data.length === 0}
    >
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} margin={{ top: 5, right: 30, bottom: 5, left: 30 }}>
          <PolarGrid className="stroke-border-primary" />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: "var(--color-text-tertiary)" }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-primary)",
              borderRadius: "12px",
              fontSize: 12,
              color: "var(--color-text-primary)",
            }}
          />
          <Radar
            name={myStoreName}
            dataKey="myStore"
            stroke={CHART_COLORS[0]}
            fill={CHART_COLORS[0]}
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Radar
            name={competitorName}
            dataKey="competitor"
            stroke={CHART_COLORS[3]}
            fill={CHART_COLORS[3]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-text-secondary)" }} />
        </RadarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

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
          <PolarGrid className="stroke-border" />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fontSize: 9 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: 12,
            }}
          />
          <Radar
            name={myStoreName}
            dataKey="myStore"
            stroke="hsl(var(--chart-1))"
            fill="hsl(var(--chart-1))"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Radar
            name={competitorName}
            dataKey="competitor"
            stroke="hsl(var(--chart-3))"
            fill="hsl(var(--chart-3))"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </RadarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconWrapper } from "./icon-wrapper";

interface StatCardProps {
  icon: LucideIcon;
  variant?: "brand" | "success" | "warning" | "danger" | "info" | "muted";
  label: string;
  value: string | number;
  unit?: string;
  sub?: React.ReactNode;
  className?: string;
}

export function StatCard({
  icon,
  variant = "brand",
  label,
  value,
  unit,
  sub,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-primary bg-surface p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <IconWrapper icon={icon} size="sm" variant={variant} />
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {unit && (
          <span className="text-xs text-text-tertiary">{unit}</span>
        )}
      </div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

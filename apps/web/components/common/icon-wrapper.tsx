"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface IconWrapperProps {
  icon: LucideIcon;
  size?: "sm" | "md" | "lg";
  variant?: "brand" | "success" | "warning" | "danger" | "info" | "muted";
  className?: string;
}

const sizeMap = {
  sm: { wrapper: "size-7 rounded-lg", icon: 14 },
  md: { wrapper: "size-8 rounded-xl", icon: 16 },
  lg: { wrapper: "size-10 rounded-xl", icon: 20 },
} as const;

const variantMap = {
  brand: "bg-brand-subtle text-brand",
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  danger: "bg-danger-light text-danger",
  info: "bg-info-light text-info",
  muted: "bg-surface-tertiary text-text-secondary",
} as const;

export function IconWrapper({
  icon: Icon,
  size = "md",
  variant = "brand",
  className,
}: IconWrapperProps) {
  const s = sizeMap[size];
  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0",
        s.wrapper,
        variantMap[variant],
        className,
      )}
    >
      <Icon size={s.icon} />
    </div>
  );
}

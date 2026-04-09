"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
  ctaLoading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  variant?: "empty" | "building";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  onCta,
  ctaLoading,
  secondaryLabel,
  onSecondary,
  variant = "empty",
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("py-10 px-4 text-center", className)}>
      <div
        className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4",
          variant === "building"
            ? "bg-gradient-to-br from-blue-100 to-violet-100"
            : "bg-muted",
        )}
      >
        {variant === "building" ? (
          <Loader2 size={22} className="text-blue-500 animate-spin" />
        ) : (
          <Icon size={22} className="text-muted-foreground" />
        )}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[260px] mx-auto">
        {description}
      </p>
      {(ctaLabel || secondaryLabel) && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {secondaryLabel && onSecondary && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSecondary}
              className="rounded-xl h-9 text-xs"
            >
              {secondaryLabel}
            </Button>
          )}
          {ctaLabel && onCta && (
            <Button
              size="sm"
              onClick={onCta}
              disabled={ctaLoading}
              className="rounded-xl h-9 text-xs bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-md"
            >
              {ctaLoading && <Loader2 size={12} className="animate-spin mr-1.5" />}
              {ctaLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

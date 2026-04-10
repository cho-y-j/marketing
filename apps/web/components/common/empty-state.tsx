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
          "size-14 rounded-2xl flex items-center justify-center mx-auto mb-4",
          variant === "building"
            ? "bg-brand-subtle"
            : "bg-surface-tertiary",
        )}
      >
        {variant === "building" ? (
          <Loader2 size={22} className="text-brand animate-spin" />
        ) : (
          <Icon size={22} className="text-text-tertiary" />
        )}
      </div>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <p className="text-xs text-text-secondary mt-1 leading-relaxed max-w-[260px] mx-auto">
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
              className="rounded-xl h-9 text-xs bg-brand hover:bg-brand-dark"
            >
              {ctaLoading && (
                <Loader2 size={12} className="animate-spin mr-1.5" />
              )}
              {ctaLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

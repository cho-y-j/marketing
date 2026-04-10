"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStores } from "@/hooks/useStore";
import { useActiveStore } from "@/hooks/useActiveStore";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Store, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StoreSwitcherProps {
  compact?: boolean;
}

export function StoreSwitcher({ compact }: StoreSwitcherProps) {
  const { data: stores } = useStores();
  const { activeStoreId, setActiveStoreId } = useActiveStore();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (stores && stores.length > 0 && !activeStoreId) {
      setActiveStoreId(stores[0].id);
    }
  }, [stores, activeStoreId, setActiveStoreId]);

  const current =
    stores?.find((s: any) => s.id === activeStoreId) || stores?.[0];
  if (!current) return null;

  const handleSwitch = (storeId: string) => {
    setActiveStoreId(storeId);
    setOpen(false);
    queryClient.invalidateQueries();
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-surface-tertiary transition-colors"
      >
        <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center shrink-0">
          <Store size={14} className="text-brand" />
        </div>
        {!compact && (
          <div className="text-left">
            <p className="text-sm font-semibold truncate max-w-[140px] leading-tight">
              {current.name}
            </p>
            {current.address && (
              <p className="text-[10px] text-text-tertiary truncate max-w-[140px] leading-tight">
                {current.address}
              </p>
            )}
          </div>
        )}
        {stores && stores.length > 1 && (
          <ChevronDown
            size={14}
            className={cn(
              "text-text-tertiary transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && stores && stores.length > 1 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "absolute top-12 w-72 bg-surface border border-border-primary rounded-2xl shadow-lg z-50 overflow-hidden",
              compact ? "right-0" : "left-0",
            )}
          >
            <div className="px-4 py-2.5 border-b border-border-primary">
              <p className="text-xs font-semibold text-text-tertiary">매장 전환</p>
            </div>
            <div className="p-1.5">
              {stores.map((s: any) => (
                <button
                  key={s.id}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center justify-between",
                    s.id === activeStoreId
                      ? "bg-brand-subtle"
                      : "hover:bg-surface-tertiary",
                  )}
                  onClick={() => handleSwitch(s.id)}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "size-8 rounded-lg flex items-center justify-center text-xs font-bold",
                        s.id === activeStoreId
                          ? "bg-brand text-white"
                          : "bg-surface-tertiary text-text-secondary",
                      )}
                    >
                      {s.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{s.name}</p>
                      {s.address && (
                        <p className="text-[10px] text-text-tertiary truncate max-w-[180px]">
                          {s.address}
                        </p>
                      )}
                    </div>
                  </div>
                  {s.id === activeStoreId && (
                    <Check size={16} className="text-brand shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

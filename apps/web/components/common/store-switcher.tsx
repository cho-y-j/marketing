"use client";

import { useEffect, useState } from "react";
import { useStores } from "@/hooks/useStore";
import { useActiveStore } from "@/hooks/useActiveStore";
import { ChevronDown, Store, Check } from "lucide-react";

interface StoreSwitcherProps {
  compact?: boolean;
}

export function StoreSwitcher({ compact }: StoreSwitcherProps) {
  const { data: stores } = useStores();
  const { activeStoreId, setActiveStoreId } = useActiveStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (stores && stores.length > 0 && !activeStoreId) {
      setActiveStoreId(stores[0].id);
    }
  }, [stores, activeStoreId, setActiveStoreId]);

  const current = stores?.find((s: any) => s.id === activeStoreId) || stores?.[0];
  if (!current) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-muted/80 transition-all active:scale-[0.98]"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Store size={14} className="text-primary" />
        </div>
        {!compact && (
          <div className="text-left">
            <p className="text-sm font-semibold truncate max-w-[140px] leading-tight">{current.name}</p>
            {current.address && (
              <p className="text-[10px] text-muted-foreground truncate max-w-[140px] leading-tight">{current.address}</p>
            )}
          </div>
        )}
        {stores && stores.length > 1 && (
          <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && stores && stores.length > 1 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute ${compact ? "right-0" : "left-0"} top-12 w-72 bg-white border rounded-2xl shadow-xl z-50 overflow-hidden`}>
            <div className="px-4 py-2.5 border-b bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground">매장 전환</p>
            </div>
            <div className="p-1.5">
              {stores.map((s: any) => (
                <button
                  key={s.id}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between ${
                    s.id === activeStoreId
                      ? "bg-primary/10"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => {
                    setActiveStoreId(s.id);
                    setOpen(false);
                    window.location.reload();
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      s.id === activeStoreId
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {s.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{s.name}</p>
                      {s.address && <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{s.address}</p>}
                    </div>
                  </div>
                  {s.id === activeStoreId && <Check size={16} className="text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

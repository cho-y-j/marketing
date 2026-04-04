"use client";

import { useEffect } from "react";
import { useStores } from "@/hooks/useStore";
import { useActiveStore } from "@/hooks/useActiveStore";
import { ChevronDown, Store, Check } from "lucide-react";
import { useState } from "react";

export function StoreSwitcher() {
  const { data: stores } = useStores();
  const { activeStoreId, setActiveStoreId } = useActiveStore();
  const [open, setOpen] = useState(false);

  // 첫 로드 시 활성 매장이 없으면 첫 번째 매장 선택
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
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
      >
        <Store size={16} className="text-primary" />
        <span className="text-sm font-medium truncate max-w-[150px]">{current.name}</span>
        {stores && stores.length > 1 && <ChevronDown size={14} className="text-muted-foreground" />}
      </button>

      {open && stores && stores.length > 1 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 w-64 bg-card border rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="px-3 py-2 border-b text-xs text-muted-foreground">매장 전환</div>
            {stores.map((s: any) => (
              <button
                key={s.id}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex items-center justify-between"
                onClick={() => {
                  setActiveStoreId(s.id);
                  setOpen(false);
                  window.location.reload(); // 전체 데이터 새로고침
                }}
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  {s.address && <p className="text-xs text-muted-foreground truncate">{s.address}</p>}
                </div>
                {s.id === activeStoreId && <Check size={14} className="text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

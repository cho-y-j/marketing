"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ActiveStoreState {
  activeStoreId: string | null;
  setActiveStoreId: (id: string) => void;
}

export const useActiveStore = create<ActiveStoreState>()(
  persist(
    (set) => ({
      activeStoreId: null,
      setActiveStoreId: (id: string) => set({ activeStoreId: id }),
    }),
    { name: "active-store" },
  ),
);

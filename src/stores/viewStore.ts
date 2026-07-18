import { create } from "zustand";
import { persist } from "zustand/middleware";

type ViewMode = "grid" | "detail";

interface ViewStore {
    view: ViewMode;
    _hydrated: boolean;
    setView: (v: ViewMode) => void;
}

export const useViewStore = create<ViewStore>()(
    persist(
        (set) => ({
            view: "grid",
            _hydrated: false,
            setView: (v) => set({ view: v }),
        }),
        {
            name: "site-view-mode",
            onRehydrateStorage: () => (state) => {
                if (state) state._hydrated = true;
            },
        }
    )
);
